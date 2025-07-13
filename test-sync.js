#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testConnection() {
  console.log('Testing Supabase connection...');
  try {
    const { data, error } = await supabase
      .from('article_summaries')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('❌ Supabase connection failed:', error.message);
      return false;
    }
    
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection error:', error);
    return false;
  }
}

async function testEnvironmentVariables() {
  console.log('\nChecking environment variables...');
  
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEWSAPI_KEY',
    'ANTHROPIC_API_KEY'
  ];
  
  let allPresent = true;
  
  for (const varName of required) {
    if (process.env[varName]) {
      console.log(`✅ ${varName} is set`);
    } else {
      console.log(`❌ ${varName} is missing`);
      allPresent = false;
    }
  }
  
  return allPresent;
}

async function testDatabaseSchema() {
  console.log('\nChecking database schema...');
  
  try {
    // Test inserting a dummy article with category_tags
    const testArticle = {
      article_url: 'https://test.example.com/' + Date.now(),
      article_title: 'Test Article',
      description: 'Test description',
      ai_summary: 'Test summary',
      image_url: 'https://test.example.com/image.jpg',
      published_at: new Date().toISOString(),
      source_id: 'test',
      source_name: 'Test Source',
      category: 'Tech',
      category_tags: ['Tech: Artificial Intelligence (AI)', 'Business: Markets & Stocks']
    };
    
    const { data, error } = await supabase
      .from('article_summaries')
      .insert([testArticle])
      .select();
    
    if (error) {
      console.error('❌ Database schema test failed:', error.message);
      return false;
    }
    
    console.log('✅ Database schema is correct');
    console.log('✅ category_tags column is working');
    
    // Clean up test article
    await supabase
      .from('article_summaries')
      .delete()
      .eq('article_url', testArticle.article_url);
    
    return true;
  } catch (error) {
    console.error('❌ Database schema error:', error);
    return false;
  }
}

async function testAPIs() {
  console.log('\nTesting external APIs...');
  
  // Test NewsAPI
  try {
    const newsApiUrl = `https://newsapi.org/v2/top-headlines?apiKey=${process.env.NEWSAPI_KEY}&sources=techcrunch&pageSize=1`;
    const response = await fetch(newsApiUrl);
    
    if (response.ok) {
      console.log('✅ NewsAPI connection successful');
    } else {
      console.log('❌ NewsAPI connection failed:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ NewsAPI error:', error.message);
    return false;
  }
  
  // Test RSS feed
  try {
    const rssResponse = await fetch('https://techcrunch.com/feed/');
    if (rssResponse.ok) {
      console.log('✅ RSS feed accessible');
    } else {
      console.log('❌ RSS feed not accessible');
      return false;
    }
  } catch (error) {
    console.log('❌ RSS feed error:', error.message);
    return false;
  }
  
  return true;
}

async function getArticleStats() {
  console.log('\nFetching article statistics...');
  
  try {
    const { data, error, count } = await supabase
      .from('article_summaries')
      .select('*', { count: 'exact', head: true });
    
    if (error) {
      console.error('❌ Failed to get article stats:', error.message);
      return;
    }
    
    console.log(`📊 Total articles in database: ${count || 0}`);
    
    // Get articles by source
    const { data: sourceData, error: sourceError } = await supabase
      .from('article_summaries')
      .select('source_name')
      .order('source_name');
    
    if (!sourceError && sourceData) {
      const sourceCounts = {};
      sourceData.forEach(row => {
        sourceCounts[row.source_name] = (sourceCounts[row.source_name] || 0) + 1;
      });
      
      console.log('\n📈 Articles by source:');
      Object.entries(sourceCounts).forEach(([source, count]) => {
        console.log(`   ${source}: ${count}`);
      });
    }
    
    // Get category distribution
    const { data: categoryData, error: categoryError } = await supabase
      .from('article_summaries')
      .select('category_tags')
      .not('category_tags', 'is', null);
    
    if (!categoryError && categoryData) {
      const categoryCount = {};
      categoryData.forEach(row => {
        if (row.category_tags && Array.isArray(row.category_tags)) {
          row.category_tags.forEach(tag => {
            categoryCount[tag] = (categoryCount[tag] || 0) + 1;
          });
        }
      });
      
      console.log('\n🏷️  Top categories:');
      const sortedCategories = Object.entries(categoryCount)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);
      
      sortedCategories.forEach(([category, count]) => {
        console.log(`   ${category}: ${count}`);
      });
    }
    
    // Get recent articles
    const { data: recentData, error: recentError } = await supabase
      .from('article_summaries')
      .select('article_title, published_at, source_name, category_tags')
      .order('published_at', { ascending: false })
      .limit(5);
    
    if (!recentError && recentData) {
      console.log('\n📰 Most recent articles:');
      recentData.forEach(article => {
        const date = new Date(article.published_at).toLocaleString();
        console.log(`   - ${article.article_title}`);
        console.log(`     ${article.source_name} | ${date}`);
        if (article.category_tags && article.category_tags.length > 0) {
          console.log(`     Tags: ${article.category_tags.join(', ')}`);
        }
      });
    }
  } catch (error) {
    console.error('❌ Error getting article stats:', error);
  }
}

async function runTests() {
  console.log('🔧 News App Sync Test Suite\n');
  console.log('================================\n');
  
  let allTestsPassed = true;
  
  // Run tests
  allTestsPassed &= await testEnvironmentVariables();
  
  if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
    allTestsPassed &= await testConnection();
    allTestsPassed &= await testDatabaseSchema();
    await getArticleStats();
  }
  
  if (process.env.NEWSAPI_KEY) {
    allTestsPassed &= await testAPIs();
  }
  
  console.log('\n================================\n');
  
  if (allTestsPassed) {
    console.log('✅ All tests passed! Ready to sync.');
  } else {
    console.log('❌ Some tests failed. Please fix the issues before running sync.');
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
