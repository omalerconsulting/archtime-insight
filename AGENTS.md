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
- Approved statement rows carry a document transaction fingerprint with a database uniqueness guarantee to prevent repeat uploads from creating duplicate expenses.
- Finance duplicate approvals persist as administrator-only row-pair fingerprints including matching fields; changed transactions require fresh review, and suspected duplicates remain in the ledger until corrected or deleted.
- Full P&L printing uses an isolated document built from the shared ledger, so every month, item and manual adjustment prints regardless of the active tab.
- Fixed expenses are virtual monthly ledger entries rather than repeated database inserts; clamp their dates to the actual month end.
