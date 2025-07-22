import { withPluginApi } from "discourse/lib/plugin-api";

let twitterScriptLoaded = false;
let pendingEmbeds = new Set();

function loadTwitterScript() {
  if (twitterScriptLoaded) return Promise.resolve();
  
  return new Promise((resolve) => {
    if (window.twttr && window.twttr.widgets) {
      twitterScriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.onload = () => {
      twitterScriptLoaded = true;
      resolve();
    };
    document.head.appendChild(script);
  });
}

function createTwitterPlaceholder(tweetId, originalUrl) {
  const placeholder = document.createElement('div');
  placeholder.className = 'twitter-embed-placeholder';
  placeholder.style.cssText = `
    border: 1px solid #e1e8ed;
    border-radius: 12px;
    padding: 20px;
    margin: 10px 0;
    background: #f7f9fa;
    cursor: pointer;
    text-align: center;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  `;
  
  placeholder.innerHTML = `
    <div style="color: #1da1f2; font-size: 24px; margin-bottom: 10px;">🐦</div>
    <div style="color: #14171a; font-weight: bold; margin-bottom: 5px;">Twitter Post</div>
    <div style="color: #657786; font-size: 14px;">Click to load tweet</div>
  `;
  
  placeholder.dataset.tweetId = tweetId;
  placeholder.dataset.originalUrl = originalUrl;
  
  return placeholder;
}

async function loadTwitterEmbed(placeholder) {
  const tweetId = placeholder.dataset.tweetId;
  const originalUrl = placeholder.dataset.originalUrl;
  
  // Create the actual Twitter blockquote
  const blockquote = document.createElement('blockquote');
  blockquote.className = 'twitter-tweet';
  blockquote.innerHTML = `<a href="${originalUrl}"></a>`;
  
  // Replace placeholder with blockquote
  placeholder.parentNode.replaceChild(blockquote, placeholder);
  
  // Load Twitter script and render
  await loadTwitterScript();
  
  if (window.twttr && window.twttr.widgets) {
    window.twttr.widgets.load(blockquote);
  }
}

function setupIntersectionObserver() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const placeholder = entry.target;
        observer.unobserve(placeholder);
        loadTwitterEmbed(placeholder);
      }
    });
  }, {
    rootMargin: '100px' // Start loading 100px before entering viewport
  });
  
  return observer;
}

function initializeTwitterNativeEmbed(api) {
  const observer = setupIntersectionObserver();
  
  api.decorateCookedElement((element) => {
    const twitterLinks = element.querySelectorAll('a[href*="twitter.com/"][href*="/status/"], a[href*="x.com/"][href*="/status/"]');
    
    twitterLinks.forEach(link => {
      const onebox = link.closest('.onebox');
      if (!onebox) return;
      
      const href = link.getAttribute('href');
      let normalizedUrl = href;
      
      // Normalize x.com to twitter.com
      if (href.includes('x.com/')) {
        normalizedUrl = href.replace('x.com/', 'twitter.com/');
      }
      
      // Extract tweet ID
      const match = normalizedUrl.match(/\/status\/(\d+)/);
      if (!match) return;
      
      const tweetId = match[1];
      
      // Create placeholder
      const placeholder = createTwitterPlaceholder(tweetId, normalizedUrl);
      
      // Replace onebox with placeholder
      onebox.parentNode.replaceChild(placeholder, onebox);
      
      // Start observing the placeholder
      observer.observe(placeholder);
      
      // Optional: Add click handler for immediate loading
      placeholder.addEventListener('click', () => {
        observer.unobserve(placeholder);
        loadTwitterEmbed(placeholder);
      });
    });
  });
}

export default {
  name: "discourse-twitter-native-embed",
  initialize() {
    withPluginApi("0.8.31", initializeTwitterNativeEmbed);
  }
};