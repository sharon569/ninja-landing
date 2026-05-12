-- Phase 14C — SEO Decision Intelligence layer.
-- Adds human-review tracking on Opportunity (the override that unblocks
-- engine-rejected high-risk recommendations) + cached decision fields for
-- fast filtering on workflow/agency pages, and a decisionSnapshot JSON on
-- ExecutionAction so Impact Review can compare actual results to the
-- measurement plan even if the source Opportunity has been recomputed.

ALTER TABLE "analyzer"."Opportunity"
    ADD COLUMN "humanReviewedAt"        TIMESTAMP(3),
    ADD COLUMN "humanReviewedBy"        TEXT,
    ADD COLUMN "humanReviewNote"        TEXT,
    ADD COLUMN "decisionRiskCache"      TEXT,
    ADD COLUMN "decisionConfidenceCache" TEXT,
    ADD COLUMN "decisionNextStepCache"  TEXT,
    ADD COLUMN "decisionComputedAt"     TIMESTAMP(3);

ALTER TABLE "analyzer"."ExecutionAction"
    ADD COLUMN "decisionSnapshot" TEXT;

CREATE INDEX "Opportunity_decisionRiskCache_idx"
    ON "analyzer"."Opportunity"("decisionRiskCache");
CREATE INDEX "Opportunity_decisionNextStepCache_idx"
    ON "analyzer"."Opportunity"("decisionNextStepCache");
