# Jimeng Canvas CLI cutover

Canva Banana uses `dreamina-canvas` for Jimeng setup, catalog discovery, generation, and downloads. Open **File → Jimeng Canvas Setup** to install the CLI and sign in to a Jimeng account. The selected account and workspace determine the models and settings available to the app.

| App workflow | Canvas support |
| --- | --- |
| Seedance 2 (JM CLI) | Smart uses text-to-video or first/last frames. Reference uses multimodal video. Standard and Standard Fast resolve to their own entries in the authenticated catalog. |
| Seedance 2.5 (JM CLI) | Smart and Reference use the same Canvas modes. Resolution and other options depend on the model and account. |
| Seedream 5.5 (JM CLI) | Text-to-image and image editing. The picker shows the model when the catalog lists both modes. |
| Saved Jimeng Multi-frame | Historical records remain readable. The Canvas CLI schema does not expose the original per-transition workflow. |

Each new job prepares a Canvas draft and displays the provider's credit quote before submission. The backend saves the Canvas job and provider operation IDs for recovery. A rerun from older Seedance metadata requests a fresh Canvas job at the saved tier. Jobs submitted to the retired CLI cannot be resumed. Saved media remains in workspace snapshots.

Canvas account and job data keep their prior locations. Set `JIMENG_CANVAS_CLI_PATH` only when using a custom `dreamina-canvas` executable. For storage and managed backend configuration, see the [Python backend guide](../packages/runtime/python/README.md).

Canvas CLI 1.4.1 authenticated with the test account and generated a Seedream 5.5 image. The account catalog lacked Standard and Standard Fast, and a live Seedance 2.5 draft quote at 480p returned a VIP requirement. Use an eligible account to verify those live video workflows.

[Jimeng CLI guide](https://jimeng.jianying.com/ai-tool/install) · [Canvas CLI installer](https://jimeng.jianying.com/canvas-cli/install.sh)
