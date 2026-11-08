---
name: EzModo Help Page Screenshots
description: Use when writing or updating a help page, how-to, runbook or any EzModo document that walks a reader through steps in an app, and whenever you are asked to add screenshots or images to an EzModo document. Covers taking one screenshot per step, cropping it to what matters, keeping customer data and secrets out of it, writing alt text, and placing it with manage_document add_image.
---

# EzModo Help Page Screenshots

A help page that says "click **Release to dev** on the milestone" is followed
faster, and trusted more, when the reader can see the button. You can take that
picture yourself, so a page that walks through an app's screens should show
them. One screenshot per step, cropped to the part the step is about, placed
right after the step.

## When to add images

- **Do** for each step where the reader has to find something on screen: a
  button, a menu item, a field, a setting, what the screen looks like when
  it worked.
- **Don't** for steps that are only typed (a command, a value), for concepts,
  or to decorate. An image the step doesn't need is one more thing to go stale
  when the screen changes.

## 1. Write the text first

Write or update the page with `manage_document`, steps numbered and each one
under its own heading or in its own paragraph, so every image has an anchor.
Then add the images. `add_image` refuses if the document changed since you
read it, so let each call finish before the next.

## 2. Take the screenshot

Use a screen you can drive, in this order of preference:

1. **A local run or a test environment of the app** with seeded or made-up
   data. This is the default for a product's own help pages.
2. **The person's browser**, through Claude in Chrome, only for a page they
   pointed you at.

With Claude in Chrome, get to the state the step describes, take a
`screenshot` to see the page, then capture the part you need with `zoom`,
`region:[x0, y0, x1, y1]` and `save_to_disk:true`. `zoom` with a region is the
crop: aim it at the element the step names plus enough around it for the reader
to find it (the panel or toolbar it sits in), not the whole window. The result
gives the saved file's path.

For a local run without the browser extension, a Playwright script with
`page.locator(...).screenshot({ path })` or `page.screenshot({ path, clip })`
does the same.

## 3. Check what is in it

Look at the saved image before you upload it. Uploading puts it in the
document's storage for everyone who can read the document, and a published
help page is public.

Never upload a screenshot showing:

- **real customer data**: names, emails, avatars, company names, task or
  document titles from a real workspace, invoices, anything from production
  you didn't create for the screenshot;
- **secrets**: API keys, tokens, passwords, connection strings, signed URLs,
  QR codes for sign-in, even partly masked;
- **the person's own private things**: other browser tabs, bookmarks,
  notifications, their email address in a header.

If the screen holds any of these, change the data (use a test workspace, rename
the test item), crop it out, or skip the image. Blurring is not a fix: you
can't check it reliably, so retake it instead.

## 4. Put the file where add_image can read it

`filePath` must be inside the checkout, and can't go through a symlink. Copy
the saved screenshot into `.ezmodo/screenshots/` with a name that says what it
is (`release-to-dev-button.png`), and keep that folder out of commits (check
`git status`; in most repos `.ezmodo/*` is already ignored). Over the remote
connector there is no checkout: send the image as `base64` with `mimeType`.

PNG, JPEG, GIF or WebP, up to 10 MB. Screenshots of UI are best as PNG.

## 5. Write the alt text

Alt text is what a screen reader says, and what a reader sees when the image
doesn't load. Say what the image shows and why it matters for this step, in a
sentence:

- Good: "The milestone page with the Release to dev button at the top right,
  next to Edit."
- Bad: "Screenshot", "image.png", "Step 3", or a repeat of the step's text.

A `caption` is optional and shown under the image; use it only when the reader
needs to be told what to look at ("The button only appears once every epic is
done.").

## 6. Place it

```
manage_document action:"add_image"
  documentId     (the page)
  filePath       ".ezmodo/screenshots/release-to-dev-button.png"   (or base64 + mimeType)
  alt            "The milestone page with the Release to dev button at the top right, next to Edit."
  afterHeading   "3. Release the milestone to dev"     (or afterText, or append:true)
```

- `afterHeading` takes the heading's text without the `#`s, and puts the image
  right below the heading. Use it when the step is a heading.
- `afterText` takes text found exactly once in the document and puts the
  image below the paragraph or list holding it. Copy enough of the step's
  sentence for it to be unique.
- `append:true` puts it at the end.

A refusal says why: the anchor matched nothing or several places (copy more
exactly, or include more text), or the document changed (read it again). In a
checkout, add_image also refuses while your local copy of the document has
unpushed edits: push them first.

## 7. Finish

- Read the document back (`get_document`) and check each image sits under the
  step it shows.
- Editing a **published** page makes it a draft, and readers keep the published
  copy. When the images are in, `manage_document action:"submit_for_review"`
  with a note listing the images you added. Agents can't publish.
- An image removed later stays in the project's Files, marked as no longer in
  the document; it is not deleted for you.
