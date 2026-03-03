// Crate Engine API — Cloudflare Worker
// KV Namespaces: CRATE_GAMES, CRATE_USERS, CRATE_MODELS
// Handles: Auth, Publish, Creator Marketplace, Purchases, User Libraries

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function err(msg, status = 400) { return json({ error: msg }, status); }

// Simple token auth — hash email+password
async function hashToken(email, password) {
  const data = new TextEncoder().encode(email.toLowerCase() + ':' + password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate session token
function genToken() {
  return crypto.randomUUID() + '-' + Date.now().toString(36);
}

// Get user from auth header
async function getUser(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const session = await env.CRATE_USERS.get('session:' + token, 'json');
  if (!session) return null;
  const user = await env.CRATE_USERS.get('user:' + session.userId, 'json');
  return user;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // ============ AUTH ============
      if (path === '/api/auth/register' && request.method === 'POST') {
        const { email, password, name } = await request.json();
        if (!email || !password) return err('Email and password required');
        
        const userId = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const existing = await env.CRATE_USERS.get('email:' + email.toLowerCase());
        if (existing) return err('Email already registered');
        
        const passHash = await hashToken(email, password);
        const user = {
          id: userId, email: email.toLowerCase(), name: name || email.split('@')[0],
          plan: 'free', // free | pro | premium
          createdAt: Date.now(),
          stripeCustomerId: null,
          library: [], // purchased model IDs
          published: [], // published game slugs
          earnings: 0,
        };
        
        await env.CRATE_USERS.put('user:' + userId, JSON.stringify(user));
        await env.CRATE_USERS.put('email:' + email.toLowerCase(), userId);
        await env.CRATE_USERS.put('pass:' + userId, passHash);
        
        const token = genToken();
        await env.CRATE_USERS.put('session:' + token, JSON.stringify({ userId, createdAt: Date.now() }), { expirationTtl: 86400 * 30 });
        
        return json({ token, user: { id: userId, email: user.email, name: user.name, plan: user.plan, library: [], published: [] } });
      }

      if (path === '/api/auth/login' && request.method === 'POST') {
        const { email, password } = await request.json();
        if (!email || !password) return err('Email and password required');
        
        const userId = await env.CRATE_USERS.get('email:' + email.toLowerCase());
        if (!userId) return err('Invalid credentials', 401);
        
        const passHash = await hashToken(email, password);
        const storedHash = await env.CRATE_USERS.get('pass:' + userId);
        if (passHash !== storedHash) return err('Invalid credentials', 401);
        
        const user = await env.CRATE_USERS.get('user:' + userId, 'json');
        const token = genToken();
        await env.CRATE_USERS.put('session:' + token, JSON.stringify({ userId, createdAt: Date.now() }), { expirationTtl: 86400 * 30 });
        
        return json({ token, user: { id: user.id, email: user.email, name: user.name, plan: user.plan, library: user.library || [], published: user.published || [] } });
      }

      if (path === '/api/auth/me' && request.method === 'GET') {
        const user = await getUser(request, env);
        if (!user) return err('Not authenticated', 401);
        return json({ user: { id: user.id, email: user.email, name: user.name, plan: user.plan, library: user.library || [], published: user.published || [], earnings: user.earnings || 0 } });
      }

      // ============ PUBLISH GAMES ============
      if (path === '/api/games/publish' && request.method === 'POST') {
        const user = await getUser(request, env);
        if (!user) return err('Login required', 401);
        if (user.plan !== 'premium') return err('Publishing requires Premium plan ($14.99/mo)', 403);
        
        const { title, description, slug, tags, sceneData, objects, commands } = await request.json();
        if (!title || !sceneData) return err('Title and scene data required');
        
        const finalSlug = (slug || title).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60);
        
        // Check slug availability
        const existing = await env.CRATE_GAMES.get('game:' + finalSlug);
        if (existing) return err('URL slug already taken');
        
        const game = {
          slug: finalSlug, title, description: description || '',
          tags: tags || [], sceneData, objects: objects || 0, commands: commands || 0,
          authorId: user.id, authorName: user.name,
          publishedAt: Date.now(), plays: 0, likes: 0, version: 1,
        };
        
        await env.CRATE_GAMES.put('game:' + finalSlug, JSON.stringify(game));
        
        // Add to user's published list
        if (!user.published) user.published = [];
        user.published.push(finalSlug);
        await env.CRATE_USERS.put('user:' + user.id, JSON.stringify(user));
        
        // Add to browse index
        const index = await env.CRATE_GAMES.get('index:games', 'json') || [];
        index.unshift({ slug: finalSlug, title, authorName: user.name, publishedAt: game.publishedAt, plays: 0 });
        await env.CRATE_GAMES.put('index:games', JSON.stringify(index.slice(0, 500)));
        
        return json({ slug: finalSlug, url: 'https://crateshipgames.com/play/' + finalSlug });
      }

      if (path.startsWith('/api/games/') && request.method === 'GET') {
        const slug = path.split('/api/games/')[1];
        if (!slug) {
          // List all games
          const index = await env.CRATE_GAMES.get('index:games', 'json') || [];
          return json({ games: index });
        }
        const game = await env.CRATE_GAMES.get('game:' + slug, 'json');
        if (!game) return err('Game not found', 404);
        // Increment plays
        game.plays = (game.plays || 0) + 1;
        await env.CRATE_GAMES.put('game:' + slug, JSON.stringify(game));
        return json({ game });
      }

      // ============ CREATOR MARKETPLACE ============
      // Upload model (anyone can upload)
      if (path === '/api/marketplace/upload' && request.method === 'POST') {
        const user = await getUser(request, env);
        if (!user) return err('Login required', 401);
        
        const { name, description, category, price, tags, fileName, fileSize, fileData } = await request.json();
        if (!name || !fileData) return err('Name and file data required');
        if (fileSize > 25 * 1024 * 1024) return err('File too large (max 25MB for KV, upgrade to R2 for larger)');
        
        const modelId = 'cm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        
        const listing = {
          id: modelId, name, description: description || '', category: category || 'props',
          price: parseFloat(price) || 0, tags: tags || [],
          fileName, fileSize,
          creatorId: user.id, creatorName: user.name,
          downloads: 0, rating: 0, reviews: 0,
          listedAt: Date.now(), approved: true, // auto-approve for now
        };
        
        // Store model binary separately (base64 in KV, R2 later)
        await env.CRATE_MODELS.put('file:' + modelId, fileData);
        // Store listing metadata
        await env.CRATE_MODELS.put('listing:' + modelId, JSON.stringify(listing));
        
        // Add to marketplace index
        const index = await env.CRATE_MODELS.get('index:marketplace', 'json') || [];
        index.unshift({ id: modelId, name, category, price: listing.price, creatorName: user.name, downloads: 0, listedAt: listing.listedAt });
        await env.CRATE_MODELS.put('index:marketplace', JSON.stringify(index.slice(0, 1000)));
        
        return json({ id: modelId, listing });
      }

      // Browse marketplace
      if (path === '/api/marketplace' && request.method === 'GET') {
        const category = url.searchParams.get('category');
        const search = url.searchParams.get('search');
        const index = await env.CRATE_MODELS.get('index:marketplace', 'json') || [];
        let filtered = index;
        if (category) filtered = filtered.filter(m => m.category === category);
        if (search) filtered = filtered.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
        return json({ models: filtered });
      }

      // Get single model listing
      if (path.startsWith('/api/marketplace/model/') && request.method === 'GET') {
        const modelId = path.split('/api/marketplace/model/')[1];
        const listing = await env.CRATE_MODELS.get('listing:' + modelId, 'json');
        if (!listing) return err('Model not found', 404);
        return json({ listing });
      }

      // Purchase / download model
      if (path === '/api/marketplace/purchase' && request.method === 'POST') {
        const user = await getUser(request, env);
        if (!user) return err('Login required', 401);
        
        const { modelId } = await request.json();
        const listing = await env.CRATE_MODELS.get('listing:' + modelId, 'json');
        if (!listing) return err('Model not found', 404);
        
        // Check if already owned
        if (user.library && user.library.includes(modelId)) {
          // Already owned — just return the file
          const fileData = await env.CRATE_MODELS.get('file:' + modelId);
          return json({ owned: true, listing, fileData });
        }
        
        if (listing.price > 0) {
          // Paid model — need Stripe payment
          // Create Stripe checkout session
          const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              'mode': 'payment',
              'success_url': env.SITE_URL + '/marketplace.html?purchased=' + modelId,
              'cancel_url': env.SITE_URL + '/marketplace.html?cancelled=1',
              'line_items[0][price_data][currency]': 'usd',
              'line_items[0][price_data][product_data][name]': listing.name + ' — 3D Model',
              'line_items[0][price_data][product_data][description]': 'by ' + listing.creatorName,
              'line_items[0][price_data][unit_amount]': Math.round(listing.price * 100),
              'line_items[0][quantity]': '1',
              'metadata[modelId]': modelId,
              'metadata[buyerId]': user.id,
              'metadata[creatorId]': listing.creatorId,
              'metadata[type]': 'model_purchase',
            }),
          });
          const session = await stripeRes.json();
          if (session.error) return err('Payment error: ' + session.error.message);
          return json({ checkoutUrl: session.url, sessionId: session.id });
        }
        
        // Free model — add to library directly
        if (!user.library) user.library = [];
        user.library.push(modelId);
        await env.CRATE_USERS.put('user:' + user.id, JSON.stringify(user));
        
        // Increment downloads
        listing.downloads = (listing.downloads || 0) + 1;
        await env.CRATE_MODELS.put('listing:' + modelId, JSON.stringify(listing));
        
        // Update index
        const index = await env.CRATE_MODELS.get('index:marketplace', 'json') || [];
        const idx = index.findIndex(m => m.id === modelId);
        if (idx >= 0) index[idx].downloads = listing.downloads;
        await env.CRATE_MODELS.put('index:marketplace', JSON.stringify(index));
        
        const fileData = await env.CRATE_MODELS.get('file:' + modelId);
        return json({ owned: true, listing, fileData });
      }

      // Get user's purchased library
      if (path === '/api/library' && request.method === 'GET') {
        const user = await getUser(request, env);
        if (!user) return err('Login required', 401);
        
        const library = [];
        for (const modelId of (user.library || [])) {
          const listing = await env.CRATE_MODELS.get('listing:' + modelId, 'json');
          if (listing) library.push(listing);
        }
        return json({ library });
      }

      // Download owned model file
      if (path === '/api/library/download' && request.method === 'POST') {
        const user = await getUser(request, env);
        if (!user) return err('Login required', 401);
        const { modelId } = await request.json();
        if (!user.library || !user.library.includes(modelId)) return err('Model not in your library', 403);
        const fileData = await env.CRATE_MODELS.get('file:' + modelId);
        if (!fileData) return err('File not found', 404);
        return json({ fileData });
      }

      // ============ STRIPE WEBHOOKS ============
      if (path === '/api/stripe/webhook' && request.method === 'POST') {
        const body = await request.text();
        // In production, verify webhook signature with env.STRIPE_WEBHOOK_SECRET
        const event = JSON.parse(body);
        
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const meta = session.metadata || {};
          
          if (meta.type === 'model_purchase') {
            // Add model to buyer's library
            const buyer = await env.CRATE_USERS.get('user:' + meta.buyerId, 'json');
            if (buyer) {
              if (!buyer.library) buyer.library = [];
              if (!buyer.library.includes(meta.modelId)) {
                buyer.library.push(meta.modelId);
                await env.CRATE_USERS.put('user:' + buyer.id, JSON.stringify(buyer));
              }
            }
            
            // Credit creator (70%)
            const creator = await env.CRATE_USERS.get('user:' + meta.creatorId, 'json');
            if (creator) {
              const amount = (session.amount_total || 0) / 100;
              creator.earnings = (creator.earnings || 0) + amount * 0.7;
              await env.CRATE_USERS.put('user:' + creator.id, JSON.stringify(creator));
            }
            
            // Increment download count
            const listing = await env.CRATE_MODELS.get('listing:' + meta.modelId, 'json');
            if (listing) {
              listing.downloads = (listing.downloads || 0) + 1;
              await env.CRATE_MODELS.put('listing:' + meta.modelId, JSON.stringify(listing));
            }
          }
          
          if (meta.type === 'subscription') {
            // Update user plan
            const user = await env.CRATE_USERS.get('user:' + meta.userId, 'json');
            if (user) {
              user.plan = meta.plan || 'pro';
              user.stripeCustomerId = session.customer;
              await env.CRATE_USERS.put('user:' + user.id, JSON.stringify(user));
            }
          }
        }
        
        if (event.type === 'customer.subscription.deleted') {
          // Downgrade to free
          const customerId = event.data.object.customer;
          // Find user by stripe customer ID (would need an index in production)
        }
        
        return json({ received: true });
      }

      // ============ SUBSCRIPTION MANAGEMENT ============
      if (path === '/api/subscribe' && request.method === 'POST') {
        const user = await getUser(request, env);
        if (!user) return err('Login required', 401);
        
        const { plan } = await request.json();
        const prices = {
          pro: { amount: 499, name: 'Pro Plan' },
          premium: { amount: 1499, name: 'Premium Plan' },
        };
        const p = prices[plan];
        if (!p) return err('Invalid plan');
        
        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + env.STRIPE_SECRET_KEY,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            'mode': 'subscription',
            'success_url': env.SITE_URL + '/?subscribed=' + plan,
            'cancel_url': env.SITE_URL + '/?cancelled=1',
            'line_items[0][price_data][currency]': 'usd',
            'line_items[0][price_data][product_data][name]': 'Crate Engine ' + p.name,
            'line_items[0][price_data][unit_amount]': p.amount,
            'line_items[0][price_data][recurring][interval]': 'month',
            'line_items[0][quantity]': '1',
            'metadata[userId]': user.id,
            'metadata[plan]': plan,
            'metadata[type]': 'subscription',
          }),
        });
        const session = await stripeRes.json();
        if (session.error) return err('Payment error: ' + session.error.message);
        return json({ checkoutUrl: session.url });
      }

      return err('Not found', 404);
    } catch (e) {
      return err('Internal error: ' + e.message, 500);
    }
  },
};
