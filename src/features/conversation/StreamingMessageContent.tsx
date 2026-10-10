import {
  isValidElement,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { useOptionalWorkbench } from "../workbench/WorkbenchProvider";
import { ConversationCodeBlock } from "./ConversationCodeBlock";

const PLAYBACK_INTERVAL_MS = 16;
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeSanitize];
const MARKDOWN_COMPONENTS: Components = {
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noreferrer noopener" />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="markdown-table-scroll">
      <table {...props} />
    </div>
  ),
  pre: MarkdownCodeBlock,
};

function MarkdownCodeBlock({
  children,
}: {
  children?: ReactNode;
}): JSX.Element {
  const workbench = useOptionalWorkbench();
  const child = isValidElement<{
    className?: string;
    children?: ReactNode;
  }>(children)
    ? children
    : null;
  const language =
    child?.props.className?.match(/language-([\w-]+)/)?.[1] ?? "plaintext";
  if (!child || typeof child.props.children !== "string") {
    return <pre>{children}</pre>;
  }
  return (
    <ConversationCodeBlock
      language={language}
      code={child.props.children}
      onOpen={workbench?.openCodeSnippet}
    />
  );
}

function nextVisibleLength(content: string, current: number): number {
  const remaining = content.length - current;
  const step = remaining > 160 ? 4 : remaining > 80 ? 2 : 1;
  const nextChunk = Array.from(content.slice(current), (character) => character)
    .slice(0, step)
    .join("");
  return current + nextChunk.length;
}

type StreamingMessageContentProps = {
  content: string;
  pending: boolean;
  children?: ReactNode;
};

export function StreamingMessageContent({
  content,
  pending,
  children,
}: StreamingMessageContentProps): JSX.Element {
  const animatedRef = useRef(pending);
  const [visibleLength, setVisibleLength] = useState(
    pending ? 0 : content.length,
  );

  useEffect(() => {
    if (pending) animatedRef.current = true;
    setVisibleLength((current) =>
      animatedRef.current ? Math.min(current, content.length) : content.length,
    );
  }, [content, pending]);

  useEffect(() => {
    if (!animatedRef.current || visibleLength >= content.length) return;
    const timer = window.setTimeout(() => {
      setVisibleLength((current) => nextVisibleLength(content, current));
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [content, visibleLength]);

  const playbackComplete = visibleLength >= content.length;

  return (
    <>
      <div
        className="chat-message-content chat-message-markdown"
        aria-live="polite"
      >
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={MARKDOWN_COMPONENTS}
        >
          {content.slice(0, visibleLength)}
        </ReactMarkdown>
      </div>
      {!pending && playbackComplete ? children : null}
    </>
  );
}
