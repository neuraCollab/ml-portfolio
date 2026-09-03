import { useEffect } from 'react';

const SITE_NAME = 'ML Portfolio';

/** Sets the browser tab title (and by extension what most crawlers/LLM
 * readers see first) to identify which project page is active -- each
 * route otherwise renders under the same generic <title> set in index.html. */
export function PageTitle({ title }: { title: string }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} — ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
  return null;
}
