// Compatibility facade for the preserved editor. Identity lives in an HttpOnly cookie.
class CrateAuth {
 constructor(){this.badgeContainers=new Set();this.user=null;this.token=null;this.refreshUser().catch(()=>{});}
 get isLoggedIn(){return Boolean(this.user);}
 get plan(){return 'free';}
 get isPro(){return false;}
 get isPremium(){return false;}
 async _fetch(path,opts={}){const response=await fetch('/api/platform'+path,{credentials:'same-origin',...opts,headers:{'Content-Type':'application/json',...opts.headers}});const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Account service unavailable.');return body;}
 async refreshUser(){const data=await this._fetch('/me');this.user=data.user;for(const container of this.badgeContainers)this.renderAccountBadge(container);return this.user;}
 async logout(){await this._fetch('/auth/logout',{method:'POST',body:'{}'});this.user=null;this.token=null;for(const key of ['crate_token','crate_user']){sessionStorage.removeItem(key);localStorage.removeItem(key);}}
 showAuthModal(){location.assign('/login?returnTo='+encodeURIComponent(location.pathname+location.search));}
 async login(){this.showAuthModal();}
 async register(){location.assign('/signup');}
 async publishGame(){throw new Error('Use the developer dashboard to submit a scanned build for review.');}
 async uploadModel(){throw new Error('Asset publication is not open yet. Your local files are preserved.');}
 async purchaseModel(){throw new Error('Purchases are not enabled.');}
 async subscribe(){throw new Error('Subscriptions are not enabled. Project exports remain available.');}
 async getGame(slug){return this._fetch('/catalog/'+encodeURIComponent(slug));}
 async listGames(){return this._fetch('/catalog');}
 async getLibrary(){return this._fetch('/library');}
 async browseMarketplace(){return {items:[],available:false};}
 async downloadModel(){throw new Error('Marketplace downloads are not available.');}
 _showAccountMenu(){location.assign('/settings');}
 renderAccountBadge(container){if(!container)return;this.badgeContainers.add(container);const a=document.createElement('a');a.className='crate-account-link';a.href=this.user?'/profile':'/login';a.textContent=this.user?.displayName||'Log In';container.replaceChildren(a);}
}
const auth=new CrateAuth();window._crateAuth=auth;export default auth;
