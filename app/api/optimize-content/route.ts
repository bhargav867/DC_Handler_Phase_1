import { NextRequest, NextResponse } from "next/server";

// OpenAI API Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

// Pixabay API Configuration
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY;

// Helper function to search Pixabay for images
async function searchPixabay(query: string): Promise<{ url: string; source: string } | null> {
  if (!PIXABAY_API_KEY) {
    console.warn('No Pixabay API key configured');
    return null;
  }

  // Ensure query is not empty or too short
  let searchQuery = query.trim();
  if (!searchQuery || searchQuery.length < 3) {
    console.warn('Query too short for Pixabay search:', query);
    return null;
  }

  // Clean up query - remove special chars, limit length
  searchQuery = searchQuery
    .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, ' ')     // Normalize spaces
    .trim();

  if (searchQuery.length > 100) {
    searchQuery = searchQuery.substring(0, 100).replace(/\s+\S*$/, '');
  }

  try {
    // Build URL manually to avoid any encoding issues
    const params = new URLSearchParams({
      key: PIXABAY_API_KEY,
      q: searchQuery,
      image_type: 'photo',
      orientation: 'horizontal',
      per_page: '3',
      safesearch: 'true'
    });
    
    const pixabayUrl = `https://pixabay.com/api/?${params.toString()}`;
    console.log('Searching Pixabay with query:', searchQuery);
    
    const response = await fetch(pixabayUrl);
    
    // Log response details
    console.log('Pixabay response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pixabay error response:', errorText.substring(0, 500));
      return null;
    }

    const data = await response.json();
    console.log('Pixabay hits:', data.hits?.length || 0);
    
    if (data.hits && data.hits.length > 0) {
      const bestImage = data.hits.find((hit: any) => hit.largeImageURL) || data.hits[0];
      return {
        url: bestImage.largeImageURL || bestImage.webformatURL,
        source: 'Pixabay',
      };
    }
    
    return null;
  } catch (error) {
    console.error('Pixabay API error:', error);
    return null;
  }
}

// Helper function to generate AI-optimized content
async function optimizeWithAI(title: string, content: string, excerpt: string): Promise<{
  optimizedTitle: string;
  optimizedContent: string;
  suggestedImage: string;
  imageSource: string;
  keywords: string[];
  seoScore: number;
  seoTitle: string;
  seoDescription: string;
  category: string;
  tags: string[];
  detectedAuthor: string;
}> {
  const query = title.replace(/<[^>]*>/g, '').trim();
  let imageResult: { url: string; source: string } | null = null;

  // If no OpenAI API key, just return mock with image search
  if (!OPENAI_API_KEY) {
    console.warn('No OpenAI API key configured');
    imageResult = await searchPixabay(query);
    
    return {
      optimizedTitle: title.replace(/<[^>]*>/g, '').trim() + ' - Enhanced',
      optimizedContent: content,
      suggestedImage: imageResult?.url || '',
      imageSource: imageResult?.source || 'No image found',
      keywords: [query],
      seoScore: 65,
      seoTitle: query.substring(0, 60),
      seoDescription: excerpt.replace(/<[^>]*>/g, '').trim().substring(0, 160),
      category: 'ai-technology',
      tags: ['news', 'update', 'trending'],
      detectedAuthor: 'jmason',
    };
  }

  const prompt = `You are a professional journalist. Create optimized content that ranks for search engines and gets views.

STRUCTURE:
1. SEO TITLE (50-60 chars, keyword first): "Keyword: How to Impact Results"
2. META DESCRIPTION (150-160 chars): Include keyword + "Learn how" or "Discover"
3. OPENING (100-150 words): Hook reader, add primary keyword naturally
4. BULLET POINTS (8-10 bullets, mixed lengths, 1-3 lines each)
5. BODY PARAGRAPHS (1200-1500 words, 8-10 paragraphs):
   - Mix short (100 word) + long (200 word) paragraphs
   - Include real examples, data, expert quotes
   - Weave keywords naturally (1-2% density)
6. CONCLUSION: Summarize + call-to-action

KEYWORDS (15-20 total):
- PRIMARY: Main search term
- SECONDARY: Related terms
- LSI: Synonyms and variations
- LONG-TAIL: 3-4 word phrases
Scatter naturally in content - NOT mechanical

CATEGORY: AI, artificial-intelligence, ai-strategy, automation, digital-strategy, humanoid-robots, news, business, defense, geopolitics, global-markets, global-news, politics, health, entertainment, films, food, hollywood, music, automotive, sports, military, trending

AUTHOR MAPPING:
- jmason: AI/artificial-intelligence/ai-strategy/automation/digital-strategy/humanoid-robots
- alexcarter: news/business/defense/geopolitics/global-markets/global-news/politics
- emily: health/entertainment/films/food/hollywood/music
- katherine-lewis: automotive/sports/military
- reginald-edward: trending/breaking

RESPONSE JSON ONLY:
{
  "seoTitle": "Keyword: Main Title (50-60 chars)",
  "optimizedTitle": "Punchy version",
  "seoDescription": "160-char meta with keyword and CTA",
  "optimizedContent": "<h1>Title</h1><p>Opening with keyword...</p><h2>Subheading</h2><ul><li>Bullet 1</li><li>Bullet 2</li></ul><p>8-10 body paragraphs 1200-1500 words total</p>",
  "primaryKeyword": "main term",
  "keywords": ["kw1", "kw2", "kw3", "long-tail phrase", "semantic variant"],
  "seoScore": 85,
  "category": "detected-category",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
  "recommendedAuthor": "author-slug",
  "imageDescription": "image 3-5 words"
}

Original Title: ${title}
Original Content: ${content}
Original Excerpt: ${excerpt}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are an expert content optimizer. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 5000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const aiContent = data.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('No content in OpenAI response');
    }

    let parsed;
    try {
      const cleanedContent = aiContent.replace(/```json\s*|\s*```/g, '').trim();
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      throw new Error('Failed to parse AI response');
    }

    const imageQuery = parsed.imageDescription || query;
    console.log('AI suggested image query:', imageQuery);
    console.log('AI generated keywords:', parsed.keywords);
    console.log('AI detected category:', parsed.category);
    console.log('AI generated tags:', parsed.tags);
    console.log('AI recommended author:', parsed.recommendedAuthor);
    console.log('SEO Score:', parsed.seoScore);
    console.log('SEO Title:', parsed.seoTitle);
    console.log('SEO Description:', parsed.seoDescription);
    
    imageResult = await searchPixabay(imageQuery);

    return {
      optimizedTitle: parsed.optimizedTitle || title,
      optimizedContent: parsed.optimizedContent || content,
      suggestedImage: imageResult?.url || '',
      imageSource: imageResult?.source || 'No image found',
      keywords: parsed.keywords || [query],
      seoScore: parsed.seoScore || 70,
      seoTitle: parsed.seoTitle || query.substring(0, 60),
      seoDescription: parsed.seoDescription || excerpt.replace(/<[^>]*>/g, '').trim().substring(0, 160),
      category: parsed.category || 'ai-technology',
      tags: parsed.tags || ['content'],
      detectedAuthor: parsed.recommendedAuthor || 'john-mason',
    };
  } catch (error) {
    console.error('OpenAI optimization error:', error);
    throw error;
  }
}

// GET: Check Pixabay API status
export async function GET() {
  const testQuery = 'nature landscape';
  console.log('Testing Pixabay API with query:', testQuery);
  
  if (PIXABAY_API_KEY) {
    const testResult = await searchPixabay(testQuery);
    return NextResponse.json({
      success: true,
      pixabayConfigured: true,
      pixabayWorking: !!testResult,
      testQuery,
    });
  }
  
  return NextResponse.json({
    success: true,
    pixabayConfigured: false,
    pixabayWorking: false,
  });
}

// POST: Optimize content with AI
export async function POST(request: NextRequest) {
  try {
    const { title, content, excerpt } = await request.json();

    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { success: false, error: "Missing OpenAI API key" },
        { status: 400 }
      );
    }

    // Use the main optimization function with Pixabay image search
    const optimized = await optimizeWithAI(title, content, excerpt);

    return NextResponse.json({
      success: true,
      optimizedTitle: optimized.optimizedTitle,
      seoTitle: optimized.seoTitle,
      seoDescription: optimized.seoDescription,
      optimizedContent: optimized.optimizedContent,
      suggestedImage: optimized.suggestedImage,
      imageSource: optimized.imageSource,
      keywords: optimized.keywords,
      seoScore: optimized.seoScore,
      category: optimized.category,
      tags: optimized.tags,
      detectedAuthor: optimized.detectedAuthor,
    });
  } catch (error) {
    console.error("Error optimizing content:", error);
    return NextResponse.json(
      { success: false, error: "Failed to optimize content" },
      { status: 500 }
    );
  }
}
