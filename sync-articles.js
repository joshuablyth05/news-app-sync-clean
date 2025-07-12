#!/usr/bin/env node

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

// Load environment variables
require('dotenv').config();

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Constants
const NEWSAPI_ENDPOINT = 'https://newsapi.org/v2/top-headlines';
const MAX_PROMPT_CHARS = 8000;

// Available categories for AI tagging
const AVAILABLE_CATEGORIES = {
  Tech: [
    'Artificial Intelligence (AI)',
    'Machine Learning',
    'Software Development',
    'Cybersecurity',
    'Cloud Computing',
    'Gadgets & Devices',
    'Startups & Innovation',
    'Blockchain & Crypto',
    'Mobile & Apps',
    'Data Science',
    'Web Development',
    'Big Data',
    'Robotics',
    'AR/VR (Augmented/Virtual Reality)',
    'Tech Policy & Regulation'
  ],
  Business: [
    'Markets & Stocks',
    'Finance & Investing',
    'Leadership',
    'Management',
    'Marketing & Advertising',
    'E-commerce',
    'Mergers & Acquisitions',
    'Small Business',
    'Corporate Strategy',
    'Economics',
    'Real Estate',
    'Human Resources',
    'Supply Chain & Logistics',
    'Sustainability & ESG (Environmental, Social, Governance)',
    'Business Law'
  ],
  Entrepreneurship: [
    'Startup Stories',
    'Fundraising & Venture Capital',
    'Pitching & Networking',
    'Growth Hacking',
    'Product Management',
    'Bootstrapping',
    'Founder Interviews',
    'Incubators & Accelerators',
    'Failure & Lessons Learned',
    'Side Hustles',
    'Remote Work & Digital Nomads'
  ],
  General: [
    'World News',
    'Politics',
    'Science & Research',
    'Health & Wellness',
    'Education',
    'Lifestyle',
    'Opinion & Analysis',
    'Culture & Society',
    'Technology in Society',
    'Work & Careers',
    'Events & Conferences'
  ]
};

// Flatten categories for easier reference
const ALL_CATEGORIES = Object.entries(AVAILABLE_CATEGORIES).flatMap(([section, cats]) => 
  cats.map(cat => `${section}: ${cat}`)
);

// RSS Sources (removed category field)
const RSS_SOURCES = [
  { id: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { id: 'ars-technica', name: 'Ars Technica', url: 'https://arstechnica.com/feed/' },
  { id: 'engadget', name: 'Engadget', url: 'https://www.engadget.com/rss.xml' },
  { id: 'venturebeat', name: 'VentureBeat', url: 'https://venturebeat.com/feed/' },
  { id: 'gizmodo', name: 'Gizmodo', url: 'https://gizmodo.com/rss' },
  { id: 'forbes', name: 'Forbes', url: 'https://www.forbes.com/business/feed/' },
  { id: 'mashable', name: 'Mashable', url: 'https://mashable.com/feeds/rss/all' },
];

// NewsAPI Sources (removed category field)
const NEWS_SOURCES = [
  { id: 'techcrunch', name: 'TechCrunch', url: 'techcrunch.com', trusted: true },
  { id: 'the-verge', name: 'The Verge', url: 'theverge.com', trusted: true },
  { id: 'wired', name: 'Wired', url: 'wired.com', trusted: true },
  { id: 'engadget', name: 'Engadget', url: 'engadget.com', trusted: true },
  { id: 'ars-technica', name: 'Ars Technica', url: 'arstechnica.com', trusted: true },
  { id: 'bloomberg', name: 'Bloomberg', url: 'bloomberg.com', trusted: true },
  { id: 'forbes', name: 'Forbes', url: 'forbes.com', trusted: true },
  { id: 'cnbc', name: 'CNBC', url: 'cnbc.com', trusted: true },
  { id: 'financial-times', name: 'Financial Times', url: 'ft.com', trusted: true },
  { id: 'business-insider', name: 'Business Insider', url: 'businessinsider.com', trusted: true },
];

const SOURCE_IDS = NEWS_SOURCES.map(s => s.id).join(',');

// Logos
const TECHCRUNCH_LOGO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/TechCrunch_logo.svg/2560px-TechCrunch_logo.svg.png';
const ENGADGET_LOGO = 'https://static.tumblr.com/ea8828fc01b1c071a0dee325bea11572/s7zj4yw/FwVo10l6n/tumblr_static_tumblr_static_dyzju4tuhoo4kk8ckgogw4ggc_focused_v3.png';

// Helper functions
function decodeXMLEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parseDate(dateString) {
  try {
    const date = new Date(dateString);
    return date.toISOString();
  } catch (error) {
    console.error('Error parsing date:', dateString, error);
    return new Date().toISOString();
  }
}

// RSS Parsing (removed category assignment)
function parseRSSXML(xmlText, source) {
  try {
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    const titleRegex = /<title[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/title>/i;
    const descriptionRegex = /<description[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/description>/i;
    const linkRegex = /<link[^>]*>\s*(?:<!\[CDATA\[)?([^<]+?)(?:\]\]>)?\s*<\/link>/i;
    const pubDateRegex = /<pubDate[^>]*>([^<]+)<\/pubDate>/i;
    const mediaContentRegex = /<media:content[^>]*url=["']([^"']+)["'][^>]*>/i;
    const mediaThumbnailRegex = /<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i;
    const contentEncodedRegex = /<content:encoded[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/content:encoded>/i;
    const imgSrcRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/i;

    const items = [];
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemXml = match[1];

      const titleMatch = itemXml.match(titleRegex);
      const descriptionMatch = itemXml.match(descriptionRegex);
      const linkMatch = itemXml.match(linkRegex);
      const pubDateMatch = itemXml.match(pubDateRegex);
      const mediaContentMatch = itemXml.match(mediaContentRegex);
      const mediaThumbnailMatch = itemXml.match(mediaThumbnailRegex);
      const contentEncodedMatch = itemXml.match(contentEncodedRegex);

      let imageUrl = undefined;

      if (source.id === 'engadget') {
        const engadgetMediaRegex = /<media:content[^>]*url=["']([^"']+)["'][^>]*medium=["']image["'][^>]*>/gi;
        const engadgetMatches = itemXml.match(engadgetMediaRegex);
        if (engadgetMatches && engadgetMatches.length > 0) {
          const urlMatch = engadgetMatches[0].match(/url=["']([^"']+)["']/);
          if (urlMatch) {
            imageUrl = urlMatch[1];
          }
        }
      } else {
        if (mediaContentMatch) {
          imageUrl = mediaContentMatch[1];
        } else if (mediaThumbnailMatch) {
          imageUrl = mediaThumbnailMatch[1];
        } else {
          let html = '';
          if (descriptionMatch) html += descriptionMatch[1];
          if (contentEncodedMatch) html += contentEncodedMatch[1];
          const imgMatch = html.match(imgSrcRegex);
          if (imgMatch) {
            imageUrl = imgMatch[1];
          }
        }
      }

      if (!imageUrl && source.id === 'techcrunch') {
        imageUrl = TECHCRUNCH_LOGO;
      }
      if (!imageUrl && source.id === 'engadget') {
        imageUrl = ENGADGET_LOGO;
      }

      let mainContent = '';
      if (contentEncodedMatch) {
        mainContent = decodeXMLEntities(contentEncodedMatch[1].trim());
      } else if (descriptionMatch) {
        mainContent = decodeXMLEntities(descriptionMatch[1].trim());
      }

      if (titleMatch && linkMatch) {
        let cleanTitle = decodeXMLEntities(titleMatch[1].trim());
        cleanTitle = cleanTitle.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
        
        let cleanLink = linkMatch[1].trim();
        cleanLink = cleanLink.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();

        items.push({
          title: cleanTitle,
          description: mainContent,
          link: cleanLink,
          pubDate: pubDateMatch ? pubDateMatch[1].trim() : new Date().toISOString(),
          imageUrl,
        });
      }
    }

    return items.slice(0, 100).map((item, index) => ({
      id: item.link || `${item.title}-${index}`,
      title: item.title,
      description: item.description,
      url: item.link,
      urlToImage: item.imageUrl,
      publishedAt: parseDate(item.pubDate),
      source: {
        id: source.id,
        name: source.name,
      },
    }));

  } catch (error) {
    console.error('Error parsing RSS XML:', error);
    return [];
  }
}

// Fetch RSS Feed
async function fetchRSSFeed(source) {
  try {
    console.log(`Fetching RSS feed for ${source.name}: ${source.url}`);
    
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const xmlText = await response.text();
    console.log(`RSS response length: ${xmlText.length} characters`);
    
    const articles = parseRSSXML(xmlText, source);
    console.log(`Parsed ${articles.length} articles from ${source.name}`);
    
    return articles;
  } catch (error) {
    console.error(`Error fetching RSS feed for ${source.name}:`, error);
    return [];
  }
}

// Fetch all RSS feeds
async function fetchAllRSSFeeds() {
  console.log('Fetching all RSS feeds...');
  
  const allArticles = [];
  
  for (const source of RSS_SOURCES) {
    try {
      const articles = await fetchRSSFeed(source);
      const filtered = articles.filter(a => !/^test\d*$/i.test(a.title.trim()));
      allArticles.push(...filtered);
      console.log(`Added ${filtered.length} articles from ${source.name}`);
    } catch (error) {
      console.error(`Error fetching RSS for ${source.name}:`, error);
    }
  }
  
  console.log(`Total RSS articles fetched: ${allArticles.length}`);
  return allArticles;
}

// Fetch from NewsAPI (removed category assignment)
async function fetchFromNewsAPI() {
  try {
    const url = `${NEWSAPI_ENDPOINT}?apiKey=${NEWSAPI_KEY}&language=en&pageSize=100&sources=${SOURCE_IDS}`;
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.articles) throw new Error('No articles found');

    const filtered = data.articles.filter((a) =>
      NEWS_SOURCES.some(s => a.source && a.source.name && a.source.name.toLowerCase().includes(s.name.toLowerCase()))
    );

    const articles = filtered.map((a, idx) => {
      const source = NEWS_SOURCES.find(s => a.source && a.source.name && a.source.name.toLowerCase().includes(s.name.toLowerCase()));
      return {
        id: a.url || `${a.title}-${idx}`,
        title: a.title,
        description: a.description || '',
        url: a.url,
        urlToImage: a.urlToImage,
        publishedAt: a.publishedAt,
        source: { id: source?.id || 'unknown', name: a.source?.name || 'Unknown' },
      };
    });

    console.log(`Fetched ${articles.length} articles from NewsAPI`);
    return articles;
  } catch (error) {
    console.error('Error fetching from NewsAPI:', error);
    return [];
  }
}

// Generate AI Summary and Categories
async function generateAISummaryAndCategories(article) {
  try {
    let content = article.description || '';
    if (content.length > MAX_PROMPT_CHARS) {
      content = content.slice(0, MAX_PROMPT_CHARS);
    }

    const categoriesList = ALL_CATEGORIES.join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Analyze this news article and provide:
1. A 3-4 sentence summary focusing on the most important facts, broader context, and potential impact
2. Select 1-3 most relevant categories from the list below

Title: ${article.title}
Content: ${content}

Available categories:
${categoriesList}

Format your response as:
SUMMARY: [your summary]
CATEGORIES: [category1, category2, category3]

Rules for categories:
- Select minimum 1, maximum 3 categories
- Use exact category names from the list
- Choose the most specific and relevant categories
- Order by relevance (most relevant first)`
      }]
    });

    const responseText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    
    // Parse the response
    const summaryMatch = responseText.match(/SUMMARY:\s*([\s\S]*?)(?=CATEGORIES:|$)/);
    const categoriesMatch = responseText.match(/CATEGORIES:\s*([\s\S]*?)$/);
    
    const summary = summaryMatch ? summaryMatch[1].trim() : 'Summary not available';
    let categories = [];
    
    if (categoriesMatch) {
      const categoriesText = categoriesMatch[1].trim();
      // Extract categories from the text
      categories = categoriesText.split(',')
        .map(cat => cat.trim())
        .filter(cat => ALL_CATEGORIES.includes(cat))
        .slice(0, 3); // Ensure max 3 categories
    }
    
    // Fallback to at least one category if none were properly parsed
    if (categories.length === 0) {
      categories = ['General: Opinion & Analysis'];
    }
    
    return { summary, categories };
  } catch (error) {
    console.error('Error generating AI summary and categories:', error);
    return {
      summary: 'AI summary temporarily unavailable',
      categories: ['General: Opinion & Analysis']
    };
  }
}

// Get or create AI summary and categories from Supabase
async function getOrCreateAISummaryAndCategories(article) {
  try {
    // Check if summary and categories already exist
    const { data, error } = await supabase
      .from('article_summaries')
      .select('ai_summary, category_tags')
      .eq('article_url', article.url)
      .single();

    if (data && data.ai_summary && data.category_tags && data.category_tags.length > 0) {
      return {
        summary: data.ai_summary,
        categories: data.category_tags
      };
    }

    // Generate new summary and categories
    const result = await generateAISummaryAndCategories(article);
    return result;
  } catch (error) {
    console.error('Error with summary/categories cache:', error);
    return generateAISummaryAndCategories(article);
  }
}

// Save article to Supabase (updated to include category_tags)
async function saveArticleToSupabase(article) {
  try {
    const { error } = await supabase
      .from('article_summaries')
      .upsert({
        article_url: article.url,
        article_title: article.title,
        description: article.description,
        ai_summary: article.aiSummary,
        image_url: article.urlToImage,
        published_at: article.publishedAt,
        source_id: article.source.id,
        source_name: article.source.name,
        category_tags: article.categoryTags, // New field
        // Keep category field for backward compatibility, use first tag's main category
        category: article.categoryTags[0]?.split(':')[0] || 'General',
      }, { onConflict: 'article_url' });

    if (error) {
      console.error('Error saving article to Supabase:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error saving article:', error);
    return false;
  }
}

// Deduplicate articles
function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.url || article.title;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// Cleanup old articles
async function cleanupOldArticles(currentArticleUrls) {
  try {
    console.log('Starting cleanup of old articles...');
    
    // Get all stored article URLs
    const { data: storedArticles, error } = await supabase
      .from('article_summaries')
      .select('article_url');

    if (error) {
      console.error('Error fetching stored articles:', error);
      return { removed: 0, errors: [error.message] };
    }

    const storedUrls = new Set(storedArticles.map(a => a.article_url));
    const urlsToRemove = [];

    storedUrls.forEach(url => {
      if (!currentArticleUrls.has(url)) {
        urlsToRemove.push(url);
      }
    });

    console.log(`Found ${urlsToRemove.length} outdated articles to remove`);

    if (urlsToRemove.length === 0) {
      return { removed: 0, errors: [] };
    }

    // Remove in batches
    const batchSize = 50;
    let removedCount = 0;
    const errors = [];

    for (let i = 0; i < urlsToRemove.length; i += batchSize) {
      const batch = urlsToRemove.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('article_summaries')
        .delete()
        .in('article_url', batch);

      if (error) {
        console.error(`Error removing batch ${i / batchSize + 1}:`, error);
        errors.push(error.message);
      } else {
        removedCount += batch.length;
        console.log(`Removed batch ${i / batchSize + 1} with ${batch.length} articles`);
      }
    }

    console.log(`Cleanup completed: ${removedCount} articles removed`);
    return { removed: removedCount, errors };
  } catch (error) {
    console.error('Error during cleanup:', error);
    return { removed: 0, errors: [error.message] };
  }
}

// Main sync function
async function syncArticles() {
  console.log('Starting article sync process...');
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
    // Fetch articles from all sources
    const [rssArticles, newsApiArticles] = await Promise.all([
      fetchAllRSSFeeds(),
      fetchFromNewsAPI(),
    ]);

    console.log(`RSS articles: ${rssArticles.length}, NewsAPI articles: ${newsApiArticles.length}`);

    // Combine and deduplicate
    const allArticles = [...rssArticles, ...newsApiArticles];
    const uniqueArticles = deduplicateArticles(allArticles);
    console.log(`Total unique articles: ${uniqueArticles.length}`);

    // Process articles and save to database
    let savedCount = 0;
    let errorCount = 0;
    const currentUrls = new Set();

    for (const article of uniqueArticles) {
      try {
        // Special handling for TechCrunch
        if (article.source.id === 'techcrunch') {
          article.title = decodeXMLEntities(article.title);
          article.urlToImage = article.urlToImage || TECHCRUNCH_LOGO;
        }

        // Generate or get AI summary and categories
        const { summary, categories } = await getOrCreateAISummaryAndCategories(article);
        article.aiSummary = summary;
        article.categoryTags = categories;
        
        console.log(`Processed: ${article.title.substring(0, 50)}... | Categories: ${categories.join(', ')}`);
        
        // Save to database
        const saved = await saveArticleToSupabase(article);
        if (saved) {
          savedCount++;
          currentUrls.add(article.url);
        } else {
          errorCount++;
        }
      } catch (error) {
        console.error(`Error processing article: ${article.title}`, error);
        errorCount++;
      }
    }

    console.log(`Saved ${savedCount} articles, ${errorCount} errors`);

    // Cleanup old articles
    const cleanupResult = await cleanupOldArticles(currentUrls);
    console.log(`Cleanup result: ${cleanupResult.removed} articles removed`);

    // Final summary
    console.log('\n=== Sync Summary ===');
    console.log(`Total articles processed: ${uniqueArticles.length}`);
    console.log(`Articles saved: ${savedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log(`Old articles removed: ${cleanupResult.removed}`);
    console.log(`Sync completed at: ${new Date().toISOString()}`);
    console.log('==================\n');

  } catch (error) {
    console.error('Fatal error during sync:', error);
    process.exit(1);
  }
}

// Run the sync
syncArticles().then(() => {
  console.log('Sync process completed successfully');
  process.exit(0);
}).catch(error => {
  console.error('Sync process failed:', error);
  process.exit(1);
});