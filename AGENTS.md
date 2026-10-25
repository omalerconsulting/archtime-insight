<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Financial reporting
- Build monthly P&L totals and drilldown details from `src/lib/pnl-ledger.ts` together so line items always reconcile to totals, including manual adjustments.
- Statement scanning uses an admin-verified server function and request-local streamed Lovable AI calls; return proposals only, because every imported transaction requires explicit review and approval.
- Extract XLS/XLSX sheets in the browser with dynamically loaded SheetJS and send bounded, non-empty text through the same validated administrator scan function; PDFs remain native file inputs and both formats use the same review, fingerprint and duplicate checks.
- Submit every statement as one full document without sampling or truncation; only resource/service guards may reject it, and errors must not ask users to split files or imply unlimited model capacity.
- Batch statement uploads through a two-worker browser queue with independent document results/retries; compare selected proposals across the whole batch and preserve per-file provenance on approved saves so failures never discard other document reviews.
- Approved statement rows carry a document transaction fingerprint with a database uniqueness guarantee to prevent repeat uploads from creating duplicate expenses.
- Statement import paginates all stored expenses after scanning and immediately before saving; reuse finance duplicate rules, retain merged-row fingerprints, and bind each explicit duplicate decision to candidate and match snapshots so edits or newly added matches require fresh review.
- Derive expense entry-source labels from the preserved statement import fingerprint rather than mutable notes; editing must not change the original source.
- Finance duplicate approvals persist as administrator-only row-pair fingerprints including matching fields; changed transactions require fresh review, and suspected duplicates remain in the ledger until corrected or deleted.
- Expense merges use an administrator-checked atomic database function with row locks and snapshot validation; absorbed rows stay excluded from the ledger but retain import fingerprints to prevent repeat statement imports.
- Full P&L printing uses an isolated document built from the shared ledger, so every month, item and manual adjustment prints regardless of the active tab.
- Fixed expenses are virtual monthly ledger entries rather than repeated database inserts; clamp their dates to the actual month end.
- The company forecast calculator is a pure reverse-profit model using administrator-entered accountant assumptions; keep VAT cash flows and tax advances separate from corporate-tax expense, and never double-subtract them from profit.
- Income amounts and payment milestones retain their source VAT basis and rate; use the shared income-VAT conversion for net profit and gross bank receipts. Historical rows default to zero VAT until reviewed, never silently reinterpret them.
