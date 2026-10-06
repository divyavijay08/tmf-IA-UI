# Customer reply preservation fix

The final customer stage failed with `ProtocolError: formatting changed authoritative findings or outcome` on trace `41f563c759124f9994e821030831f99b`.

`customer-response-format.patch` changes only the final formatter's model contract to `{answer, disposition}`. The protocol assembles identity, routing, outcome and evidence arrays from the validated request and last specialist result, then runs the unchanged validator. Other stages keep their original schema. No retries, limits, permissions or tool configuration are changed. Failed/refused calls are still failures; this is not a fallback that turns a failed run into a success.

Apply to the backend checkout only after `git apply --check` succeeds and comparing the deployed protocol to that checkout. Run `python3 backend-patches/test_customer_response.py PATH_TO_PATCHED_WORKFLOW_PROTOCOL` before deploying. The tests cover evidence preservation, no input mutation, approval/insufficient-information outcomes, rejection of extra fields, and retention of refusals.

Historical failed runs remain unchanged. The UI adapter separately publishes an allowlisted diagnostic from their saved stage results, so failures remain inspectable even when their HTTP spans succeeded.
