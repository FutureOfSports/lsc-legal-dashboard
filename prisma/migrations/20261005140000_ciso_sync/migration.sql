-- CreateTable
CREATE TABLE "CisoSyncObject" (
    "id" TEXT NOT NULL,
    "instance_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source_reference" TEXT NOT NULL,
    "remote_marker" TEXT NOT NULL,
    "remote_id" TEXT,
    "delivered_revision" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CisoSyncObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CisoSyncJob" (
    "id" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_email" TEXT NOT NULL,
    "approval_reference" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "last_error_code" TEXT,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CisoSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CisoSyncAttempt" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "lease_token" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "outcome" TEXT NOT NULL DEFAULT 'STARTED',
    "error_code" TEXT,
    "remote_id" TEXT,
    "response_hash" TEXT,

    CONSTRAINT "CisoSyncAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CisoSyncObject_remote_marker_key" ON "CisoSyncObject"("remote_marker");

-- CreateIndex
CREATE UNIQUE INDEX "CisoSyncObject_instance_key_kind_source_reference_key" ON "CisoSyncObject"("instance_key", "kind", "source_reference");

-- CreateIndex
CREATE INDEX "CisoSyncJob_status_available_at_idx" ON "CisoSyncJob"("status", "available_at");

-- CreateIndex
CREATE INDEX "CisoSyncJob_status_lease_until_idx" ON "CisoSyncJob"("status", "lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "CisoSyncJob_object_id_revision_key" ON "CisoSyncJob"("object_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "CisoSyncAttempt_lease_token_key" ON "CisoSyncAttempt"("lease_token");

-- CreateIndex
CREATE UNIQUE INDEX "CisoSyncAttempt_job_id_attempt_key" ON "CisoSyncAttempt"("job_id", "attempt");

-- AddForeignKey
ALTER TABLE "CisoSyncJob" ADD CONSTRAINT "CisoSyncJob_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "CisoSyncObject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CisoSyncAttempt" ADD CONSTRAINT "CisoSyncAttempt_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "CisoSyncJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
