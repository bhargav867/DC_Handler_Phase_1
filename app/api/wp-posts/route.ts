import { NextRequest, NextResponse } from "next/server";

// WordPress API Configuration
const WP_BASE_URL = 'https://digitalchew.com/wp-json';
const WP_APP_USERNAME = process.env.WP_APP_USERNAME ?? '';
const WP_APP_PASSWORD = process.env.WP_APP_PASSWORD ?? '';

// Helper function to create Basic Auth header
function createAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;

  console.log("username is", username);
  console.log("password is", password);
  
  
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
}

// Helper function to fetch from WordPress API with error handling
async function fetchFromWordPress(endpoint: string, options: RequestInit = {}): Promise<any> {
  try {
    const url = `${WP_BASE_URL}${endpoint}`;
    
    console.log('Fetching URL:', url);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'NextJS-WP-Client/1.0',
      ...(options.headers as Record<string, string> || {}),
    };

    // Add authentication if credentials are provided
    if (WP_APP_USERNAME && WP_APP_PASSWORD) {
      headers['Authorization'] = createAuthHeader(WP_APP_USERNAME, WP_APP_PASSWORD);
    } else {
      console.warn('Warning: No WordPress authentication credentials provided');
    }

    console.log('Headers:', {
      ...headers,
      Authorization: headers.Authorization ? '[HIDDEN]' : 'Not set'
    });

    const response = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
    });

    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
        console.error('Error response body:', errorText);
      } catch (e) {
        errorText = 'Could not read error response';
      }
      
      throw new Error(`WordPress API error (${response.status}): ${response.statusText}. Details: ${errorText.substring(0, 200)}`);
    }

    return await response.json();
  } catch (error) {
    console.error('WordPress API fetch error:', error);
    throw error;
  }
}

// GET: Fetch posts from WordPress
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") || "draft";
    const perPage = searchParams.get("per_page") || "100";

    const WP_URL = process.env.WORDPRESS_URL;
    const WP_USERNAME = process.env.WORDPRESS_USERNAME;
    const WP_PASSWORD = process.env.WORDPRESS_PASSWORD;

    if (!WP_URL || !WP_USERNAME || !WP_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "Missing WordPress credentials" },
        { status: 400 }
      );
    }

    const auth = Buffer.from(`${WP_USERNAME}:${WP_PASSWORD}`).toString("base64");

    const response = await fetch(
      `${WP_URL}/wp-json/wp/v2/posts?status=${status}&per_page=${perPage}&_embed`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[DEBUG] WordPress API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        url: `${WP_URL}/wp-json/wp/v2/posts?status=${status}&per_page=${perPage}&_embed`,
        headers: Array.from(response.headers.entries())
      });
      throw new Error(`WordPress API error: ${response.statusText} - ${errorBody.substring(0, 200)}`);
    }

    const posts = await response.json();
    
    // Deduplicate posts by title to remove duplicate entries (for draft posts, slug is empty)
    const seenTitles = new Set<string>();
    const uniquePosts = posts.filter((post: any) => {
      const title = post.title?.rendered || '';
      if (seenTitles.has(title)) {
        return false;
      }
      seenTitles.add(title);
      return true;
    });
    
    const total = response.headers.get("x-wp-total") || "0";
    const totalPages = response.headers.get("x-wp-totalpages") || "0";
    const currentPage = searchParams.get("page") || "1";

    return NextResponse.json({
      success: true,
      data: uniquePosts,
      pagination: {
        total: parseInt(total),
        totalPages: parseInt(totalPages),
        currentPage: parseInt(currentPage),
        perPage: parseInt(perPage),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching posts:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}