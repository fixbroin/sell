
import { useId } from 'react';

interface JsonLdScriptProps {
  data: Record<string, unknown>;
  idSuffix?: string; // To make ID more unique if multiple on page
}

const JsonLdScript: React.FC<JsonLdScriptProps> = ({ data, idSuffix }) => {
  const reactId = useId();
  const baseId = idSuffix ? `json-ld-${idSuffix}` : 'json-ld-script';
  const scriptId = `${baseId}-${reactId.replace(/:/g, '')}`;

  return (
    <script
      id={scriptId}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
};

export default JsonLdScript;
