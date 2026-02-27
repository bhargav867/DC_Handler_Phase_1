import { NextRequest, NextResponse } from "next/server";

// WordPress API Configuration
const WP_BASE_URL = 'https://digitalchew.com/wp-json';
const WP_USERNAME = process.env.WORDPRESS_USERNAME ?? '';
const WP_PASSWORD = process.env.WORDPRESS_PASSWORD ?? '';

// Helper function to create Basic Auth header
function createAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
}

export interface WPAuthor {
  id: number;
  name: string;
  slug: string;
  avatar_urls?: {
    [key: string]: string;
  };
}

// GET: Fetch all authors from WordPress
export async function GET(request: NextRequest) {
  try {
    if (!WP_USERNAME || !WP_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "Missing WordPress credentials" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${WP_BASE_URL}/wp/v2/users?per_page=100&_fields=id,name,slug,avatar_urls`,
      {
        headers: {
          'Authorization': createAuthHeader(WP_USERNAME, WP_PASSWORD),
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('WordPress API error fetching authors:', errorText);
      throw new Error(`Failed to fetch authors: ${response.status}`);
    }

    const authors: WPAuthor[] = await response.json();

    return NextResponse.json({
      success: true,
      data: authors,
    });
  } catch (error) {
    console.error("Error fetching authors:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch authors" },
      { status: 500 }
    );
  }
}
