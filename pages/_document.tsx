import Document, { Head, Html, Main, NextScript } from 'next/document';

import { PAGES_ROUTER_FAVICON } from '@/lib/config/favicons';

export default class FineDietDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="icon" href={PAGES_ROUTER_FAVICON} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
