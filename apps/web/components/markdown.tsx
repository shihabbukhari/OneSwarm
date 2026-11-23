"use client";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import rehypeHighlight from "rehype-highlight";

/**
 * Markdown for every message. Agent output is untrusted: raw HTML is never
 * parsed (no rehype-raw), the tree is sanitized, and unsafe URLs are dropped
 * by react-markdown's default URL transform. Highlighting runs after
 * sanitizing, so only our own class names are added.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-msg text-[14px] leading-[1.55] text-paper">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="text-ash">[image: {alt}]</span>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
