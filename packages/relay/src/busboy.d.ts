declare module 'busboy' {
  import type { IncomingHttpHeaders } from 'node:http';
  import type { Readable } from 'node:stream';

  interface BusboyConfig {
    headers: IncomingHttpHeaders;
    limits?: {
      files?: number;
      fileSize?: number;
    };
  }

  interface FileInfo {
    filename: string;
    encoding: string;
    mimeType: string;
  }

  interface Busboy extends NodeJS.WritableStream {
    on(event: 'file', listener: (name: string, stream: Readable, info: FileInfo) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
  }

  function Busboy(config: BusboyConfig): Busboy;
  export default Busboy;
}