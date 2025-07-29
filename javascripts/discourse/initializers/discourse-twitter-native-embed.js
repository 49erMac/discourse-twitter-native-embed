import { withPluginApi } from "discourse/lib/plugin-api";

let twitterScriptLoaded = false;
let globalObserver = null;

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
  placeholder.setAttribute('data-processed', 'true'); // Mark as processed
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
  blockquote.setAttribute('data-processed', 'true'); // Mark as processed
  blockquote.innerHTML = `<a href="${originalUrl}"></a>`;
  
  // Replace placeholder with blockquote
  placeholder.parentNode.replaceChild(blockquote, placeholder);
  
  // Load Twitter script and render
  await loadTwitterScript();
  
  if (window.twttr && window.twttr.widgets) {
    window.twttr.widgets.load(blockquote);
  }
}

function setupGlobalIntersectionObserver() {
  if (globalObserver) return globalObserver;
  
  globalObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const placeholder = entry.target;
        globalObserver.unobserve(placeholder);
        loadTwitterEmbed(placeholder);
      }
    });
  }, {
    rootMargin: '100px'
  });
  
  return globalObserver;
}

function initializeTwitterNativeEmbed(api) {
  const observer = setupGlobalIntersectionObserver();
  
  api.decorateCookedElement((element) => {
    // Only process links that haven't been processed yet
    const twitterLinks = element.querySelectorAll('a[href*="twitter.com/"][href*="/status/"]:not([data-processed]), a[href*="x.com/"][href*="/status/"]:not([data-processed])');
    
    twitterLinks.forEach(link => {
      // Mark link as processed immediately to prevent re-processing
      link.setAttribute('data-processed', 'true');
      
      const onebox = link.closest('.onebox');
      if (!onebox) return;
      
      // Skip if onebox already has processed content
      if (onebox.querySelector('[data-processed]')) return;
      
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
      
      // Add click handler for immediate loading
      placeholder.addEventListener('click', () => {
        observer.unobserve(placeholder);
        loadTwitterEmbed(placeholder);
      });
    });
    
    // Also check for any existing twitter blockquotes that need processing
    const existingBlockquotes = element.querySelectorAll('blockquote.twitter-tweet:not([data-processed])');
    existingBlockquotes.forEach(blockquote => {
      blockquote.setAttribute('data-processed', 'true');
      loadTwitterScript().then(() => {
        if (window.twttr && window.twttr.widgets) {
          window.twttr.widgets.load(blockquote);
        }
      });
    });
  }, {
    id: "twitter-native-embed", // Unique ID for this decorator
    onlyStream: false, // Process all content, not just new posts
    afterAdopt: false // Run before adoption to avoid conflicts
  });
}

export default {
  name: "discourse-twitter-native-embed",
  initialize() {
    withPluginApi("0.8.31", initializeTwitterNativeEmbed);
  }
};