-- CreateTable
CREATE TABLE "FspComplianceSnapshot" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "origin_key" TEXT NOT NULL,
    "feed_hash" TEXT NOT NULL,
    "feed" JSONB NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FspComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FspComplianceAssessment" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "results" JSONB NOT NULL,
    "result_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FspComplianceAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FspComplianceDecision" (
    "id" TEXT NOT NULL,
    "assessment_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source_reference" TEXT NOT NULL,
    "evidence_as_of" TIMESTAMP(3) NOT NULL,
    "review_on" TIMESTAMP(3) NOT NULL,
    "owner" TEXT,
    "control_status" TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
    "evidence_reference" TEXT,
    "actor_id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FspComplianceDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FspComplianceSnapshot_revision_key" ON "FspComplianceSnapshot"("revision");

-- CreateIndex
CREATE UNIQUE INDEX "FspComplianceSnapshot_origin_key_key" ON "FspComplianceSnapshot"("origin_key");

-- CreateIndex
CREATE UNIQUE INDEX "FspComplianceAssessment_snapshot_id_key" ON "FspComplianceAssessment"("snapshot_id");

-- CreateIndex
CREATE INDEX "FspComplianceDecision_rule_id_created_at_idx" ON "FspComplianceDecision"("rule_id", "created_at");

-- CreateIndex
CREATE INDEX "FspComplianceDecision_assessment_id_rule_id_created_at_idx" ON "FspComplianceDecision"("assessment_id", "rule_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "FspComplianceDecision_assessment_id_rule_id_revision_key" ON "FspComplianceDecision"("assessment_id", "rule_id", "revision");

-- AddForeignKey
ALTER TABLE "FspComplianceAssessment" ADD CONSTRAINT "FspComplianceAssessment_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "FspComplianceSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FspComplianceDecision" ADD CONSTRAINT "FspComplianceDecision_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "FspComplianceAssessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
