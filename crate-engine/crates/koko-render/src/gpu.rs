//! GPU context — wgpu device, queue, surface, MSAA

use std::sync::Arc;
use wgpu::*;
use winit::window::Window;
use koko_core::color::Color;

pub const MSAA_SAMPLES: u32 = 4;

/// Core GPU state — device, queue, surface
pub struct GpuContext {
    pub instance: Instance,
    pub adapter: Adapter,
    pub device: Device,
    pub queue: Queue,
    pub surface: Surface<'static>,
    pub surface_config: SurfaceConfiguration,
    pub size: (u32, u32),
    pub sample_count: u32,
    pub depth_texture: Texture,
    pub depth_view: TextureView,
    /// MSAA multisample render target
    pub msaa_texture: Option<Texture>,
    pub msaa_view: Option<TextureView>,
}

impl GpuContext {
    pub async fn new(window: Arc<Window>) -> Self {
        let size = window.inner_size();
        let width = size.width.max(1);
        let height = size.height.max(1);

        let instance = Instance::new(&InstanceDescriptor {
            backends: Backends::all(),
            ..Default::default()
        });

        let surface = instance.create_surface(window.clone()).expect("Failed to create surface");

        let adapter = instance.request_adapter(&RequestAdapterOptions {
            power_preference: PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }).await.expect("Failed to find GPU adapter");

        tracing::info!("GPU: {}", adapter.get_info().name);
        tracing::info!("Backend: {:?}", adapter.get_info().backend);

        let (device, queue) = adapter.request_device(&DeviceDescriptor {
            label: Some("KOKO Device"),
            required_features: Features::empty(),
            required_limits: Limits::default(),
            ..Default::default()
        }).await.expect("Failed to create device");

        let surface_caps = surface.get_capabilities(&adapter);
        let format = surface_caps.formats.iter()
            .find(|f| f.is_srgb())
            .copied()
            .unwrap_or(surface_caps.formats[0]);

        let surface_config = SurfaceConfiguration {
            usage: TextureUsages::RENDER_ATTACHMENT,
            format,
            width, height,
            present_mode: PresentMode::AutoVsync,
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &surface_config);

        let (depth_texture, depth_view) = Self::create_depth_texture(&device, width, height, MSAA_SAMPLES);
        let (msaa_texture, msaa_view) = Self::create_msaa_texture(&device, format, width, height);

        Self {
            instance, adapter, device, queue, surface, surface_config,
            size: (width, height),
            sample_count: MSAA_SAMPLES,
            depth_texture, depth_view,
            msaa_texture: Some(msaa_texture),
            msaa_view: Some(msaa_view),
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 { return; }
        self.size = (width, height);
        self.surface_config.width = width;
        self.surface_config.height = height;
        self.surface.configure(&self.device, &self.surface_config);

        let (dt, dv) = Self::create_depth_texture(&self.device, width, height, MSAA_SAMPLES);
        self.depth_texture = dt;
        self.depth_view = dv;

        let (mt, mv) = Self::create_msaa_texture(&self.device, self.format(), width, height);
        self.msaa_texture = Some(mt);
        self.msaa_view = Some(mv);
    }

    pub fn format(&self) -> TextureFormat { self.surface_config.format }
    pub fn aspect_ratio(&self) -> f32 { self.size.0 as f32 / self.size.1 as f32 }

    fn create_depth_texture(device: &Device, width: u32, height: u32, sample_count: u32) -> (Texture, TextureView) {
        let texture = device.create_texture(&TextureDescriptor {
            label: Some("Depth Texture"),
            size: Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1, sample_count,
            dimension: TextureDimension::D2,
            format: TextureFormat::Depth32Float,
            usage: TextureUsages::RENDER_ATTACHMENT | TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&TextureViewDescriptor::default());
        (texture, view)
    }

    fn create_msaa_texture(device: &Device, format: TextureFormat, width: u32, height: u32) -> (Texture, TextureView) {
        let texture = device.create_texture(&TextureDescriptor {
            label: Some("MSAA Texture"),
            size: Extent3d { width, height, depth_or_array_layers: 1 },
            mip_level_count: 1, sample_count: MSAA_SAMPLES,
            dimension: TextureDimension::D2,
            format,
            usage: TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        });
        let view = texture.create_view(&TextureViewDescriptor::default());
        (texture, view)
    }

    pub fn begin_frame(&self) -> Result<(SurfaceTexture, TextureView), SurfaceError> {
        let output = self.surface.get_current_texture()?;
        let view = output.texture.create_view(&TextureViewDescriptor::default());
        Ok((output, view))
    }

    pub fn create_clear_pass<'a>(
        encoder: &'a mut CommandEncoder,
        view: &'a TextureView,
        depth_view: &'a TextureView,
        clear_color: Color,
    ) -> RenderPass<'a> {
        encoder.begin_render_pass(&RenderPassDescriptor {
            label: Some("Main Render Pass"),
            color_attachments: &[Some(RenderPassColorAttachment {
                view,
                resolve_target: None,
                depth_slice: None,
                ops: Operations {
                    load: LoadOp::Clear(wgpu::Color {
                        r: clear_color.r as f64, g: clear_color.g as f64,
                        b: clear_color.b as f64, a: clear_color.a as f64,
                    }),
                    store: StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(RenderPassDepthStencilAttachment {
                view: depth_view,
                depth_ops: Some(Operations { load: LoadOp::Clear(1.0), store: StoreOp::Store }),
                stencil_ops: None,
            }),
            ..Default::default()
        })
    }
}
