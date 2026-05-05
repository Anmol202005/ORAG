import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client: DynamoDBClient = new DynamoDBClient({});

export const docClient: DynamoDBDocumentClient =
  DynamoDBDocumentClient.from(client);