import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeMathjaxBrowser from 'rehype-mathjax/browser'
import { MathJax } from 'better-react-mathjax'

type MathTextProps = {
  children: string
}

export default function MathText({ children }: MathTextProps) {
  return (
    <MathJax
      key={children}
      hideUntilTypeset="first"
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeMathjaxBrowser]}
      >
        {children}
      </ReactMarkdown>
    </MathJax>
  )
}