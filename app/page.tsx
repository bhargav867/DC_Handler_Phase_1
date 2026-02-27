"use client";

import { useState, useEffect } from "react";

interface WPPost {
  id: number;
  title: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  date: string;
  slug: string;
  status: string;
  featured_media?: number;
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      source_url: string;
      alt_text: string;
    }>;
  };
}

interface APIResponse {
  success: boolean;
  data: WPPost[];
  pagination: {
    total: number;
    totalPages: number;
    currentPage: number;
    perPage: number;
  };
  timestamp: string;
}

interface OptimizationResult {
  postId: number;
  optimizedTitle: string;
  optimizedContent: string;
  suggestedImage: string;
  imageSource: string;
  selectedAuthorId?: number;
  keywords: string[];
  seoScore: number;
  seoTitle: string;
  seoDescription: string;
  category: string;
  tags: string[];
  detectedAuthor: string;
}

interface WPAuthor {
  id: number;
  name: string;
  slug: string;
}

interface PublishStatus {
  [postId: number]: {
    publishing: boolean;
    published: boolean;
    error: string | null;
    imageUrl?: string;
  };
}

export default function Home() {
  const [posts, setPosts] = useState<WPPost[]>([]);
  const [authors, setAuthors] = useState<WPAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPosts, setSelectedPosts] = useState<number[]>([]);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationProgress, setOptimizationProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [results, setResults] = useState<OptimizationResult[]>([]);
  const [expandedPosts, setExpandedPosts] = useState<number[]>([]);
  const [publishStatus, setPublishStatus] = useState<PublishStatus>({});
  const [selectedAuthorId, setSelectedAuthorId] = useState<number | null>(null);

  useEffect(() => {
    async function fetchInitialData() {
      try {
        setLoading(true);
        
        // Fetch draft posts
        const postsResponse = await fetch("/api/wp-posts?status=draft&per_page=100");
        const postsData: APIResponse = await postsResponse.json();

        if (postsData.success) {
          setPosts(postsData.data);
        } else {
          setError("Failed to fetch draft posts");
        }

        // Fetch authors
        const authorsResponse = await fetch("/api/wp-authors");
        const authorsData = await authorsResponse.json();

        if (authorsData.success) {
          setAuthors(authorsData.data);
          // Set default author to first one if available
          if (authorsData.data.length > 0) {
            setSelectedAuthorId(authorsData.data[0].id);
          }
        }
      } catch (err) {
        setError("Error fetching data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    fetchInitialData();
  }, []);

  const togglePostSelection = (postId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedPosts((prev) =>
      prev.includes(postId)
        ? prev.filter((id) => id !== postId)
        : [...prev, postId]
    );
  };

  const selectAll = () => {
    setSelectedPosts(posts.map((post) => post.id));
  };

  const deselectAll = () => {
    setSelectedPosts([]);
  };

  const toggleExpanded = (postId: number) => {
    setExpandedPosts((prev) =>
      prev.includes(postId)
        ? prev.filter((id) => id !== postId)
        : [...prev, postId]
    );
  };

  const optimizeWithAI = async () => {
    if (selectedPosts.length === 0) {
      setError("Please select at least one post to optimize");
      return;
    }

    setOptimizing(true);
    setOptimizationProgress({ current: 0, total: selectedPosts.length });
    setError(null);
    setResults([]);

    const newResults: OptimizationResult[] = [];

    for (let i = 0; i < selectedPosts.length; i++) {
      const postId = selectedPosts[i];
      const post = posts.find((p) => p.id === postId);

      if (!post) continue;

      try {
        setOptimizationProgress({ current: i + 1, total: selectedPosts.length });

        const response = await fetch("/api/optimize-content", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: post.title.rendered,
            content: post.content.rendered,
            excerpt: post.excerpt.rendered,
          }),
        });

        const data = await response.json();

        if (data.success) {
          newResults.push({
            postId,
            optimizedTitle: data.optimizedTitle,
            optimizedContent: data.optimizedContent,
            suggestedImage: data.suggestedImage,
            imageSource: data.imageSource,
            selectedAuthorId: selectedAuthorId || undefined,
            keywords: data.keywords || [],
            seoScore: data.seoScore || 0,
            seoTitle: data.seoTitle || data.optimizedTitle,
            seoDescription: data.seoDescription || '',
            category: data.category || 'ai-technology',
            tags: data.tags || [],
            detectedAuthor: data.detectedAuthor || 'john-mason',
          });
        } else {
          newResults.push({
            postId,
            optimizedTitle: post.title.rendered,
            optimizedContent: post.content.rendered,
            suggestedImage: "",
            imageSource: "Failed to generate suggestion",
            selectedAuthorId: selectedAuthorId || undefined,
            keywords: [],
            seoScore: 0,
            seoTitle: '',
            seoDescription: '',
            category: 'ai-technology',
            tags: [],
            detectedAuthor: 'john-mason',
          });
        }
      } catch (err) {
        console.error(`Error optimizing post ${postId}:`, err);
        newResults.push({
          postId,
          optimizedTitle: post.title.rendered,
          optimizedContent: post.content.rendered,
          suggestedImage: "",
          imageSource: "Error during optimization",
          selectedAuthorId: selectedAuthorId || undefined,
          keywords: [],
          seoScore: 0,
          seoTitle: '',
          seoDescription: '',
          category: 'ai-technology',
          tags: [],
          detectedAuthor: 'john-mason',
        });
      }
    }

    setResults(newResults);
    // Auto-expand all optimized posts
    setExpandedPosts(newResults.map((r) => r.postId));
    setOptimizing(false);
    setOptimizationProgress(null);
  };

  const publishToWordPress = async (
    result: OptimizationResult,
    publish: boolean
  ) => {
    setPublishStatus((prev) => ({
      ...prev,
      [result.postId]: {
        publishing: true,
        published: false,
        error: null,
      },
    }));

    try {
      const response = await fetch("/api/publish-post", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId: result.postId,
          optimizedTitle: result.optimizedTitle,
          optimizedContent: result.optimizedContent,
          suggestedImage: result.suggestedImage,
          selectedAuthorId: result.selectedAuthorId,
          detectedAuthorId: result.detectedAuthor,
          seoTitle: result.seoTitle,
          seoDescription: result.seoDescription,
          keywords: result.keywords,
          seoScore: result.seoScore,
          category: result.category,
          tags: result.tags,
          publish,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setPublishStatus((prev) => ({
          ...prev,
          [result.postId]: {
            publishing: false,
            published: true,
            error: null,
            imageUrl: data.data?.imageUrl,
          },
        }));
      } else {
        setPublishStatus((prev) => ({
          ...prev,
          [result.postId]: {
            publishing: false,
            published: false,
            error: data.error || "Failed to publish",
          },
        }));
      }
    } catch (err) {
      console.error(`Error publishing post ${result.postId}:`, err);
      setPublishStatus((prev) => ({
        ...prev,
        [result.postId]: {
          publishing: false,
          published: false,
          error: "Error publishing post",
        },
      }));
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 font-sans dark:bg-black p-8">
      <h1 className="text-3xl font-bold mb-8 text-zinc-800 dark:text-zinc-100">
        Draft Posts - AI Optimization
      </h1>

      {loading && (
        <div className="text-zinc-600 dark:text-zinc-400">Loading...</div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded dark:bg-red-900 dark:border-red-700 dark:text-red-100">
          {error}
        </div>
      )}

      {!loading && !error && posts.length > 0 && (
        <div className="w-full max-w-7xl">
          {/* Action Bar */}
          <div className="mb-6 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-2 items-center flex-wrap">
              <button
                onClick={selectAll}
                className="px-4 py-2 bg-zinc-200 text-zinc-800 rounded hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600 transition-colors"
              >
                Select All ({posts.length})
              </button>
              <button
                onClick={deselectAll}
                className="px-4 py-2 bg-zinc-200 text-zinc-800 rounded hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600 transition-colors"
              >
                Deselect All
              </button>
              <span className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                {selectedPosts.length} selected
              </span>

              {/* Author Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Author:
                </label>
                <select
                  value={selectedAuthorId || ""}
                  onChange={(e) => setSelectedAuthorId(parseInt(e.target.value))}
                  className="px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded text-zinc-800 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-500 focus:outline-none focus:border-blue-500"
                >
                  {authors.map((author) => (
                    <option key={author.id} value={author.id}>
                      {author.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={optimizeWithAI}
              disabled={optimizing || selectedPosts.length === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {optimizing
                ? `Optimizing ${optimizationProgress?.current ?? 0}/${optimizationProgress?.total ?? 0}...`
                : `Optimize ${selectedPosts.length} Post${selectedPosts.length !== 1 ? "s" : ""} with AI`}
            </button>
          </div>

          {/* Posts List with Original and Optimized Comparison */}
          <div className="space-y-6">
            {posts.map((post) => {
              const result = results.find((r) => r.postId === post.id);
              const isExpanded = expandedPosts.includes(post.id);
              const status = publishStatus[post.id];

              return (
                <article
                  key={post.id}
                  className={`rounded-lg border transition-all ${
                    selectedPosts.includes(post.id)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500"
                      : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  {/* Header - Always Visible */}
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer"
                    onClick={() => toggleExpanded(post.id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPosts.includes(post.id)}
                      onChange={() => togglePostSelection(post.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 w-5 h-5 rounded border-zinc-300 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <h2
                        className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 truncate"
                        dangerouslySetInnerHTML={{ __html: post.title.rendered }}
                      />
                      <div className="text-sm text-zinc-500 dark:text-zinc-400">
                        {new Date(post.date).toLocaleDateString()} •{" "}
                        <span className="inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                          {post.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {result && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded dark:bg-green-900 dark:text-green-200">
                          Optimized
                        </span>
                      )}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-5 w-5 text-zinc-500 transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-700">
                      {/* Original vs Optimized Comparison */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Original Post */}
                        <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                          <h3 className="font-semibold mb-3 text-zinc-700 dark:text-zinc-300">
                            Original
                          </h3>
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                Title
                              </p>
                              <p
                                className="font-medium text-zinc-800 dark:text-zinc-200"
                                dangerouslySetInnerHTML={{
                                  __html: post.title.rendered,
                                }}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                Excerpt
                              </p>
                              <div
                                className="text-sm text-zinc-600 dark:text-zinc-400"
                                dangerouslySetInnerHTML={{
                                  __html: post.excerpt.rendered,
                                }}
                              />
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                Content
                              </p>
                              <div
                                className="text-sm text-zinc-600 dark:text-zinc-400 max-h-48 overflow-y-auto"
                                dangerouslySetInnerHTML={{
                                  __html: post.content.rendered,
                                }}
                              />
                            </div>
                            {post._embedded?.["wp:featuredmedia"]?.[0]
                              ?.source_url && (
                              <div>
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                                  Featured Image
                                </p>
                                <img
                                  src={
                                    post._embedded["wp:featuredmedia"][0]
                                      .source_url
                                  }
                                  alt={
                                    post._embedded["wp:featuredmedia"][0]
                                      .alt_text || "Featured image"
                                  }
                                  className="w-full h-40 object-cover rounded"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Optimized Version */}
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                          {result ? (
                            <>
                              <h3 className="font-semibold mb-3 text-green-700 dark:text-green-400">
                                AI Optimized
                              </h3>

                              {/* SEO Metrics */}
                              <div className="mb-4 p-3 bg-white dark:bg-zinc-800 rounded border border-green-200 dark:border-green-700">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                    SEO Score
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <div className="w-32 h-2 bg-gray-300 dark:bg-gray-600 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full ${
                                          result.seoScore >= 80
                                            ? "bg-green-500"
                                            : result.seoScore >= 60
                                            ? "bg-yellow-500"
                                            : "bg-red-500"
                                        }`}
                                        style={{ width: `${result.seoScore}%` }}
                                      />
                                    </div>
                                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                                      {result.seoScore}%
                                    </span>
                                  </div>
                                </div>
                                {result.keywords && result.keywords.length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                      Keywords:
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {result.keywords.map((keyword, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-1 text-xs bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full"
                                        >
                                          {keyword}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* SEO Title and Description */}
                                {result.seoTitle && (
                                  <div>
                                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                      SEO Title:
                                    </p>
                                    <p className="text-sm bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100">
                                      {result.seoTitle}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                      {result.seoTitle.length}/60 characters
                                    </p>
                                  </div>
                                )}

                                {result.seoDescription && (
                                  <div>
                                    <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                      SEO Meta Description:
                                    </p>
                                    <p className="text-sm bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-200 dark:border-purple-700 text-purple-900 dark:text-purple-100">
                                      {result.seoDescription}
                                    </p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                                      {result.seoDescription.length}/160 characters
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Auto-detected WordPress metadata */}
                              <div className="mt-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-700">
                                <p className="text-xs font-bold text-purple-700 dark:text-purple-400 mb-2">
                                  🤖 AUTO-DETECTED WORDPRESS METADATA
                                </p>
                                <div className="space-y-2 text-xs">
                                  <div className="flex justify-between">
                                    <span className="text-purple-600 dark:text-purple-300">Author:</span>
                                    <span className="font-semibold text-purple-900 dark:text-purple-100">{result.detectedAuthor}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-purple-600 dark:text-purple-300">Category:</span>
                                    <span className="font-semibold text-purple-900 dark:text-purple-100">{result.category}</span>
                                  </div>
                                  <div>
                                    <span className="text-purple-600 dark:text-purple-300">Tags:</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {result.tags.map((tag, idx) => (
                                        <span
                                          key={idx}
                                          className="px-2 py-0.5 bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200 rounded-full text-xs"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">
                                    Title
                                  </p>
                                  <p
                                    className="font-medium text-green-800 dark:text-green-200"
                                    dangerouslySetInnerHTML={{
                                      __html: result.optimizedTitle,
                                    }}
                                  />
                                </div>
                                <div>
                                  <p className="text-xs text-green-600 dark:text-green-400 mb-1">
                                    Content
                                  </p>
                                  <div
                                    className="text-sm text-green-700 dark:text-green-400 max-h-48 overflow-y-auto"
                                    dangerouslySetInnerHTML={{
                                      __html: result.optimizedContent,
                                    }}
                                  />
                                </div>
                                {result.suggestedImage && (
                                  <div>
                                    <p className="text-xs text-green-600 dark:text-green-400 mb-1">
                                      Suggested Image ({result.imageSource})
                                    </p>
                                    <img
                                      src={result.suggestedImage}
                                      alt="AI suggested image"
                                      className="w-full h-40 object-cover rounded"
                                    />
                                  </div>
                                )}

                                {/* Publish Actions */}
                                <div className="pt-3 border-t border-green-200 dark:border-green-800">
                                  {status?.publishing ? (
                                    <span className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded dark:bg-yellow-900 dark:text-yellow-200 text-sm">
                                      Publishing...
                                    </span>
                                  ) : status?.published ? (
                                    <span className="px-4 py-2 bg-green-100 text-green-800 rounded dark:bg-green-900 dark:text-green-200 text-sm">
                                      ✓ Published
                                    </span>
                                  ) : status?.error ? (
                                    <span className="px-4 py-2 bg-red-100 text-red-800 rounded dark:bg-red-900 dark:text-red-200 text-sm">
                                      ✗ {status.error}
                                    </span>
                                  ) : (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() =>
                                          publishToWordPress(result, true)
                                        }
                                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                                      >
                                        Publish to WordPress
                                      </button>
                                      <button
                                        onClick={() =>
                                          publishToWordPress(result, false)
                                        }
                                        className="px-4 py-2 bg-zinc-200 text-zinc-800 rounded hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-600 transition-colors text-sm"
                                      >
                                        Save as Draft
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
                              Select this post and click "Optimize with AI" to see
                              the optimized version
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !error && posts.length === 0 && (
        <div className="text-zinc-600 dark:text-zinc-400">
          No draft posts found.
        </div>
      )}
    </div>
  );
}
