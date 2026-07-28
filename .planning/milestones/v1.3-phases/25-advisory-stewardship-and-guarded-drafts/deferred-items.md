# Deferred items

- The required serial full suite currently reports 31 failures outside Plan 25-04:
  installed-controller lifecycle/install/recovery tests time out waiting for publication, and
  the pre-existing skipped `real UserPromptSubmit hook resolves...` test continues after
  `t.skip()` and throws on empty hook output. The focused 25-04 and adjacent suites pass.
