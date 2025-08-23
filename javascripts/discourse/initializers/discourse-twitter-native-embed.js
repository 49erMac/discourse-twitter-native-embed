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
    min-height: 420px; /* Increased height for less jitter */
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    transition: min-height 0.2s;
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
  // Prevent double-embedding
  if (placeholder.dataset.embedLoaded === "true") return;
  placeholder.dataset.embedLoaded = "true";

  const tweetId = placeholder.dataset.tweetId;
  const originalUrl = placeholder.dataset.originalUrl;

  // Create the actual Twitter blockquote
  const blockquote = document.createElement('blockquote');
  blockquote.className = 'twitter-tweet';
  blockquote.setAttribute('data-processed', 'true'); // Mark as processed
  blockquote.setAttribute('data-embed-loaded', 'true'); // Mark as embedded
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

function processTwitterLinks(element, observer) {
  // Only process links that haven't been processed yet
  const twitterLinks = element.querySelectorAll(
    'a[href*="twitter.com/"][href*="/status/"]:not([data-processed]), a[href*="x.com/"][href*="/status/"]:not([data-processed])'
  );

  twitterLinks.forEach(link => {
    // Mark link as processed immediately to prevent re-processing
    link.setAttribute('data-processed', 'true');

    const onebox = link.closest('.onebox');
    if (!onebox) return;

    // If already replaced with an embed, skip
    if (
      onebox.querySelector('.twitter-tweet[data-embed-loaded="true"]') ||
      onebox.querySelector('.twitter-embed-placeholder[data-embed-loaded="true"]')
    ) {
      return;
    }

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
  const existingBlockquotes = element.querySelectorAll('blockquote.twitter-tweet[data-embed-loaded="true"]');
  existingBlockquotes.forEach(blockquote => {
    // Already embedded, do nothing
  });

  // For legacy blockquotes that are not marked, mark them as embedded
  const legacyBlockquotes = element.querySelectorAll('blockquote.twitter-tweet:not([data-embed-loaded])');
  legacyBlockquotes.forEach(blockquote => {
    blockquote.setAttribute('data-embed-loaded', 'true');
    blockquote.setAttribute('data-processed', 'true');
    loadTwitterScript().then(() => {
      if (window.twttr && window.twttr.widgets) {
        window.twttr.widgets.load(blockquote);
      }
    });
  });
}

function initializeTwitterNativeEmbed(api) {
  const observer = setupGlobalIntersectionObserver();

  // Use the new post stream API for cooked post processing
  if (api.decorateCooked) {
    api.decorateCooked(
      ($elem, helper) => {
        processTwitterLinks($elem, observer);
      },
      {
        id: "twitter-native-embed",
        onlyStream: false,
        afterAdopt: false,
      }
    );
  } else {
    // Fallback for older Discourse versions
    api.decorateCookedElement((element) => {
      processTwitterLinks(element, observer);
    }, {
      id: "twitter-native-embed",
      onlyStream: false,
      afterAdopt: false,
    });
  }
}

export default {
  name: "discourse-twitter-native-embed",
  initialize() {
    withPluginApi("0.8.31", initializeTwitterNativeEmbed);
  }
};