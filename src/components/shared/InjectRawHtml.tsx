
"use client";

import { useEffect, useState } from 'react';

interface InjectRawHtmlProps {
  htmlContent: string;
}

/**
 * A component to safely inject raw HTML content, including <script> and <noscript> tags,
 * into the DOM. This is intended for snippets like the GTM noscript tag which cannot
 * be handled by next/script.
 */
const InjectRawHtml: React.FC<InjectRawHtmlProps> = ({ htmlContent }) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) {
    return null;
  }

  // We render into a div which is then used to inject its content into the body.
  // Using a portal or directly manipulating document.body might be options, but
  // this is a straightforward way to get the parsed HTML.
  // Note: This is a simplified approach. For complex scripts, more robust handling might be needed.
  return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
};

export default InjectRawHtml;
