import Stripe from "stripe";
import { env } from "./env";

let _stripe: Stripe;

export function stripe() {
  if (!_stripe) {
    _stripe = new Stripe(env.STRIPE_SECRET_KEY(), {
      typescript: true,
    });
  }
  return _stripe;
}
