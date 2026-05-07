import type { BaseHttpClient } from "../http.js";
import { type ProInterestResponse, parseProInterestResponse } from "../models.js";

export interface InterestExpressOptions {
  company?: string;
  useCase?: string;
  notes?: string;
}

export class InterestResource {
  constructor(private readonly client: BaseHttpClient) {}

  async express(
    email: string,
    name: string,
    options: InterestExpressOptions = {}
  ): Promise<ProInterestResponse> {
    const body: Record<string, unknown> = { email, name };
    if (options.company !== undefined) body.company = options.company;
    if (options.useCase !== undefined) body.use_case = options.useCase;
    if (options.notes !== undefined) body.notes = options.notes;
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      "/interest/pro",
      { body }
    );
    return parseProInterestResponse(data);
  }

  async status(): Promise<boolean> {
    const { data } = await this.client.request<Record<string, unknown> | null>(
      "GET",
      "/interest/pro/status"
    );
    return Boolean(data?.expressed);
  }
}
