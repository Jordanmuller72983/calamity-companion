import type { NewsItem, NewsStatus } from './liveTypes'

/** Latest headline about this topic from the last 24 hours, for the School / Work / Buses tiles. */
export function topicHeadline(news: NewsStatus | undefined, topic: 'school' | 'work' | 'transport'): NewsItem | undefined {
  const since = Date.now() - 24 * 3600 * 1000
  return news?.items.find((n) => n.topics.includes(topic) && new Date(n.publishedAt).getTime() > since)
}
