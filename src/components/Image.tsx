import NextImage, { ImageProps } from "next/image";

/**
 * Wrapper around next/image that always sets unoptimized={true}.
 */
export default function Image(props: ImageProps) {
  return <NextImage {...props} unoptimized />;
}
