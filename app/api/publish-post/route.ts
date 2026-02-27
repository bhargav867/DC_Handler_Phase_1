import { NextRequest, NextResponse } from "next/server";

// WordPress API Configuration
const WP_BASE_URL = 'https://digitalchew.com/wp-json';
const WP_USERNAME = process.env.WORDPRESS_USERNAME ?? '';
const WP_PASSWORD = process.env.WORDPRESS_PASSWORD ?? '';

// Author slug to display name mapping
const AUTHOR_MAPPING: {[key: string]: string} = {
  'jmason': 'John Mason',
  'alexcarter': 'Alex Carter',
  'emily': 'Emily',
  'katherine-lewis': 'Katherine Lewis',
  'reginald-edward': 'Reginald Edward',
};

// Helper function to create Basic Auth header
function createAuthHeader(username: string, password: string): string {
  const credentials = `${username}:${password}`;
  const encodedCredentials = Buffer.from(credentials).toString('base64');
  return `Basic ${encodedCredentials}`;
}

// Helper function to get user ID by name or email
async function getUserIdByName(username: string): Promise<number | null> {
  try {
    const response = await fetch(
      `${WP_BASE_URL}/wp/v2/users?slug=${encodeURIComponent(username)}&_fields=id`,
      {
        headers: {
          'Authorization': createAuthHeader(WP_USERNAME, WP_PASSWORD),
        },
      }
    );

    if (!response.ok) return null;
    const users = await response.json();
    return users.length > 0 ? users[0].id : null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

// Helper function to get or create category
async function getCategoryIdByName(categoryName: string): Promise<number | null> {
  try {
    const categorySlug = categoryName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    const response = await fetch(
      `${WP_BASE_URL}/wp/v2/categories?slug=${categorySlug}&_fields=id`,
      {
        headers: {
          'Authorization': createAuthHeader(WP_USERNAME, WP_PASSWORD),
        },
      }
    );

    if (!response.ok) return null;
    const categories = await response.json();
    return categories.length > 0 ? categories[0].id : null;
  } catch (error) {
    console.error('Error fetching category:', error);
    return null;
  }
}

// Helper function to get or create tags
async function getTagIdsByNames(tagNames: string[]): Promise<number[]> {
  try {
    const tagIds: number[] = [];

    for (const tagName of tagNames) {
      const tagSlug = tagName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      
      const response = await fetch(
        `${WP_BASE_URL}/wp/v2/tags?slug=${tagSlug}&_fields=id`,
        {
          headers: {
            'Authorization': createAuthHeader(WP_USERNAME, WP_PASSWORD),
          },
        }
      );

      if (response.ok) {
        const tags = await response.json();
        if (tags.length > 0) {
          tagIds.push(tags[0].id);
        }
      }
    }

    return tagIds;
  } catch (error) {
    console.error('Error fetching tags:', error);
    return [];
  }
}

// Helper function to upload image to WordPress media library
async function uploadImageToWordPress(
  imageUrl: string,
  filename: string
): Promise<{ id: number; url: string } | null> {
  try {
    // Fetch the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }

    const imageBlob = await imageResponse.blob();
    const arrayBuffer = await imageBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    console.log('[DEBUG] Uploading image to WordPress:');
    console.log('  - filename:', filename);
    console.log('  - contentType:', imageBlob.type);
    console.log('  - data length:', uint8Array.length);

    // Upload to WordPress media library
    const uploadResponse = await fetch(`${WP_BASE_URL}/wp/v2/media`, {
      method: 'POST',
      headers: {
        'Content-Type': imageBlob.type || 'image/jpeg',
        'Authorization': createAuthHeader(WP_USERNAME, WP_PASSWORD),
        // Required by WordPress REST API for media uploads
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
      body: uint8Array,
    });


    console.log('upload response is ', uploadResponse);
    
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Failed to upload image: ${uploadResponse.status} - ${errorText}`);
    }

    const mediaData = await uploadResponse.json();
    return { id: mediaData.id, url: mediaData.source_url };
  } catch (error) {
    console.error('Error uploading image:', error);
    return null;
  }
}

// Helper function to update WordPress post
async function updateWordPressPost(
  postId: number,
  title: string,
  content: string,
  featuredMediaId?: number,
  authorId?: number,
  categoryId?: number,
  tagIds?: number[],
  status: string = 'draft',
  seoTitle?: string,
  seoDescription?: string,
  keywords?: string[],
  seoScore?: number
): Promise<boolean> {
  try {
    const updateData: any = {
      title: title,
      content: content,
      status: status,
      featured_media: featuredMediaId,
    };

    // Add author if provided
    if (authorId) {
      updateData.author = authorId;
    }

    // Add category if provided
    if (categoryId) {
      updateData.categories = [categoryId];
    }

    // Add tags if provided
    if (tagIds && tagIds.length > 0) {
      updateData.tags = tagIds;
    }

    // Add SEO metadata to update payload - MUST be in meta field for REST API
    // Using Rank Math meta keys (rank_math_title, rank_math_description, rank_math_focus_keyword)
    if (seoTitle || seoDescription || keywords?.length > 0 || seoScore !== undefined) {
      updateData.meta = updateData.meta || {};
      updateData.meta['rank_math_title'] = seoTitle || '';
      updateData.meta['rank_math_description'] = seoDescription || '';
      updateData.meta['rank_math_focus_keyword'] = keywords?.[0] || '';
      updateData.meta['rank_math_score'] = seoScore?.toString() || '';
      
      console.log('[DEBUG] SEO meta fields added to update (Rank Math):', updateData.meta);
    }

    console.log('[DEBUG] Final update payload:', JSON.stringify(updateData, null, 2));

    const updateResponse = await fetch(`${WP_BASE_URL}/wp/v2/posts/${postId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': createAuthHeader(WP_USERNAME, WP_PASSWORD),
      },
      body: JSON.stringify(updateData),
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('[DEBUG] WordPress update error:', errorText);
      throw new Error(`Failed to update post: ${updateResponse.status} - ${errorText}`);
    }

    const responseData = await updateResponse.json();
    console.log('[DEBUG] WordPress update response meta:', responseData.meta);
    console.log('[DEBUG] Updated post data:', JSON.stringify({
      id: responseData.id,
      title: responseData.title?.rendered,
      meta: responseData.meta,
    }, null, 2));

    return true;
  } catch (error) {
    console.error('Error updating post:', error);
    return false;
  }
}

// POST: Publish optimized content to WordPress
export async function POST(request: NextRequest) {
  try {
    const {
      postId,
      optimizedTitle,
      optimizedContent,
      suggestedImage,
      selectedAuthorId,
      detectedAuthorId,
      seoTitle,
      seoDescription,
      keywords,
      seoScore,
      category,
      tags,
      publish,
    } = await request.json();

    console.log('[DEBUG POST] Received publish request with:');
    console.log('  - postId:', postId);
    console.log('  - seoTitle:', seoTitle);
    console.log('  - seoDescription:', seoDescription);
    console.log('  - keywords:', keywords);
    console.log('  - seoScore:', seoScore);
    console.log('  - category:', category);
    console.log('  - tags:', tags);

    if (!WP_USERNAME || !WP_PASSWORD) {
      return NextResponse.json(
        { success: false, error: "Missing WordPress credentials" },
        { status: 400 }
      );
    }

    let featuredMediaId: number | undefined;
    let uploadedImageUrl: string | undefined;

    // Step 1: Upload image if provided
    if (suggestedImage && suggestedImage.trim()) {
      console.log('[DEBUG] Attempting to upload image:', suggestedImage);
      
      const filename = `featured-image-${postId}-${Date.now()}.jpg`;
      const uploadResult = await uploadImageToWordPress(suggestedImage, filename);
      
      if (uploadResult) {
        console.log('[DEBUG] Image uploaded successfully:', uploadResult);
        featuredMediaId = uploadResult.id;
        uploadedImageUrl = uploadResult.url;
      } else {
        console.warn('[DEBUG] Failed to upload image, continuing without it');
      }
    }

    // Step 2: Resolve detected author and other metadata
    console.log('[DEBUG] Publishing post with auto-detected metadata:');
    console.log('  - Detected Author:', detectedAuthorId);
    console.log('  - Category:', category);
    console.log('  - Tags:', tags);
    console.log('  - SEO Title:', seoTitle);
    console.log('  - SEO Description:', seoDescription);

    // Get author ID from detected author slug
    const authorId = await getUserIdByName(detectedAuthorId);
    console.log('[DEBUG] Resolved author:', detectedAuthorId, '-> ID:', authorId);

    // Get category ID
    let categoryId: number | undefined;
    if (category) {
      categoryId = await getCategoryIdByName(category);
      console.log('[DEBUG] Resolved category:', category, '-> ID:', categoryId);
    }

    // Get tag IDs
    let tagIds: number[] = [];
    if (tags && tags.length > 0) {
      tagIds = await getTagIdsByNames(tags);
      console.log('[DEBUG] Resolved tags:', tags, '-> IDs:', tagIds);
    }
    
    const success = await updateWordPressPost(
      postId,
      optimizedTitle,
      optimizedContent,
      featuredMediaId,
      authorId || undefined,
      categoryId,
      tagIds.length > 0 ? tagIds : undefined,
      publish ? 'publish' : 'draft',
      seoTitle,
      seoDescription,
      keywords,
      seoScore
    );

    if (!success) {
      throw new Error('Failed to update post');
    }

    return NextResponse.json({
      success: true,
      data: {
        postId,
        imageUrl: uploadedImageUrl || suggestedImage,
        featured_media_id: featuredMediaId,
        author_id: authorId,
        category_id: categoryId,
        tag_ids: tagIds,
        seo_title: seoTitle,
        seo_description: seoDescription,
        detected_author: detectedAuthorId,
      },
    });
  } catch (error) {
    console.error("Error publishing post:", error);
    return NextResponse.json(
      { success: false, error: "Failed to publish post" },
      { status: 500 }
    );
  }
}
