"use client"

import * as React from "react"
import Link from "next/link"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button-variants"

type Variants = VariantProps<typeof buttonVariants>

type LinkProps = React.ComponentProps<typeof Link>

type ButtonAsLinkProps = Variants &
  Omit<LinkProps, "className"> & {
    href: LinkProps["href"]
    className?: string
  }

type ButtonAsButtonProps = Variants &
  Omit<ButtonPrimitive.Props, "className"> & {
    href?: undefined
    className?: string
  }

export type ButtonProps = ButtonAsLinkProps | ButtonAsButtonProps

/**
 * Canonical button. Renders a Next.js `Link` when `href` is provided; otherwise
 * renders the base-ui button primitive. All styling variants are routed
 * through `buttonVariants` so anchors-as-buttons stay visually identical to
 * real buttons.
 */
function Button(props: ButtonProps) {
  if ("href" in props && props.href !== undefined) {
    const { variant = "default", size = "default", className, ...rest } = props
    return (
      <Link
        {...rest}
        className={cn(buttonVariants({ variant, size, className }))}
      />
    )
  }
  const { variant = "default", size = "default", className, ...rest } = props
  return (
    <ButtonPrimitive
      data-slot="button"
      {...rest}
      className={cn(buttonVariants({ variant, size, className }))}
    />
  )
}

export { Button, buttonVariants }
