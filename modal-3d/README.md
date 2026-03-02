# Crate Engine — 3D Generation Service (Modal.com)

## Setup
1. `pip install modal`
2. `modal setup` (authenticate)
3. `modal deploy app.py` (deploy to cloud)

## Endpoints (after deploy)
- `POST /generate` — Generate 3D model from image
- `GET /health` — Health check

## Test locally
```bash
modal run app.py test_image.png
```

## Cost
- L4 GPU: ~$0.005 per generation
- Container idles for 60s then scales to zero
- Free tier: $30/month (~6,000 generations)
