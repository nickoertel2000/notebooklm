import { defineStorage } from "@aws-amplify/backend"
import { ingest } from "../functions/ingest/resource.ts"

// S3-Bucket für hochgeladene Quellen. Jeder Upload triggert die ingest-Lambda.
// Die ingest-Lambda braucht explizit Lesezugriff auf den Upload-Pfad — Trigger-
// Funktionen bekommen den in Amplify Gen 2 nicht automatisch (sonst AccessDenied
// beim s3:GetObject im Handler).
export const storage = defineStorage({
  name: "notebooklmSources",
  triggers: {
    onUpload: ingest
  },
  access: (allow) => ({
    "notebooks/*": [allow.resource(ingest).to(["read"])]
  })
})
