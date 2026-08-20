-- Phase Q: additive column only. career.prepare_application stores a local-only
-- application draft here; it never changes yusuf_career_opportunities.status.
ALTER TABLE "yusuf_career_opportunities" ADD COLUMN "applicationNotes" TEXT;
