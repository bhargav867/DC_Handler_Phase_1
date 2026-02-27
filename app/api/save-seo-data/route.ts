import { NextRequest, NextResponse } from "next/server";

const WP_BASE_URL = 'https://digitalchew.com/wp-json';
const WP_USERNAME = process.env.WORDPRESS_USERNAME ?? '';
const WP_PASSWORD = process.env.WORDPRESS_PASSWORD ?? '';

function createAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
}

// POST: Save SEO data directly to WordPress post meta
export async function POST(request: NextRequest) {
  try {
    const {
      postId,
      seoTitle,
      seoDescription,
      keyword,
      seoScore,
    } = await request.json();

    if (!WP_USERNAME || !WP_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "Missing WordPress credentials" },
        { status: 400 }
      );
    }

    if (!postId) {
      return NextResponse.json(
        { success: false, error: "Missing postId" },
        { status: 400 }
      );
    }

    console.log('[DEBUG SEO] Saving SEO data for post:', postId);

    const auth = createAuthHeader(WP_USERNAME, WP_PASSWORD);
    const results: any = {};

    // Save SEO title
    if (seoTitle) {
      console.log('[DEBUG SEO] Saving title:', seoTitle);
      const titleResponse = await fetch(
        `${WP_BASE_URL}/wp/v2/posts/${postId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': auth,
          },
          body: JSON.stringify({
            yoast_head: `<title>${seoTitle}</title>`,
          }),
        }
      );
      
      if (titleResponse.ok) {
        results.title_saved = true;
      }
    }

    // Save meta fields with underscore prefix (Yoast compatible)
    const metaFields: any = {};
    if (seoTitle) metaFields._yoast_wpseo_title = seoTitle;
    if (seoDescription) metaFields._yoast_wpseo_metadesc = seoDescription;
    if (keyword) metaFields._yoast_wpseo_focuskw = keyword;

    // Send as proper meta object
    const updateResponse = await fetch(
      `${WP_BASE_URL}/wp/v2/posts/${postId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': auth,
        },
        body: JSON.stringify({
          meta: metaFields,
        }),
      }
    );

    const responseData = await updateResponse.json();

    if (!updateResponse.ok) {
      console.error('[DEBUG SEO] Meta update failed:', responseData);
      
      // Try alternative approach - update each field individually
      console.log('[DEBUG SEO] Trying individual field updates...');
      
      for (const [key, value] of Object.entries(metaFields)) {
        try {
          const fieldResponse = await fetch(
            `${WP_BASE_URL}/wp/v2/posts/${postId}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': auth,
              },
              body: JSON.stringify({
                meta: { [key]: value },
              }),
            }
          );
          console.log(`[DEBUG SEO] Field ${key} response:`, fieldResponse.status);
        } catch (e) {
          console.error(`[DEBUG SEO] Error saving field ${key}:`, e);
        }
      }
    } else {
      console.log('[DEBUG SEO] Successfully saved SEO data');
    }

    return NextResponse.json({
      success: true,
      data: {
        postId,
        seoTitle,
        seoDescription,
        keyword,
      },
    });
  } catch (error) {
    console.error('Error saving SEO data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save SEO data' },
      { status: 500 }
    );
  }
}
