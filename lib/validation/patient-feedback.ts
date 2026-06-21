import { z } from "zod";

const optionalUuid = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "generic");

/** Ровно один из двух должен быть указан — заполняется UI в зависимости от контекста вызова. */
export const prepareFeedbackLinkSchema = z
  .object({
    appointmentId: optionalUuid,
    treatmentItemId: optionalUuid,
  })
  .refine((v) => !!v.appointmentId || !!v.treatmentItemId, { message: "notFound" });

const optionalComment = z
  .string()
  .trim()
  .max(1000, "commentTooLong")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

export const submitFeedbackSchema = z.object({
  token: z.string().trim().min(1, "notFound"),
  rating: z.coerce.number().int().min(1, "ratingInvalid").max(5, "ratingInvalid"),
  comment: optionalComment,
});
