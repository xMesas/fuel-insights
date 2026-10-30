package com.fuelinsights.shared;

/**
 * An account is about to be deleted, in the same transaction. A listener that must undo something outside the
 * database first (cancel a paid plan) can stop the deletion by throwing.
 */
public record AccountDeleting(long userId) {
}
