# External availability data policy

The application currently contains availability/source provenance related to `sakat-ve-cezali.com` and `sahadan.com`, but this repository does not contain an automated scraper for either site.

A public statement granting automated extraction or commercial reuse was not identified during this audit for either source. Therefore automation permission must **not** be assumed. Existing `source_url` / `detail_source_*` provenance is server-side metadata and must not be exposed through browser roles or public APIs.

Before adding an automated fetcher:
1. obtain written permission or verify applicable published terms;
2. respect robots/rate limits and attribution/licensing requirements;
3. store only the fields needed for the product;
4. keep source provenance server-side when it should not be exposed publicly.

If permission is not available, prefer:
- official TFF disciplinary/PFDK announcements for suspensions;
- official club announcements for injuries/returns;
- a licensed sports-data provider whose contract explicitly permits application and commercial use.

The public API intentionally omits the private `detail_source_*` provenance fields.
