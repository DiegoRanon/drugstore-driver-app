import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Linking } from 'react-native';

import { PrimaryAction, SecondaryAction } from '@/components/driver/actions';
import { Banner } from '@/components/driver/chrome';
import { ChoiceSheet } from '@/components/driver/choice-sheet';
import { CoolerPrompt } from '@/components/driver/cooler-prompt';
import { OrderCard } from '@/components/driver/order-card';
import { PaymentSheet } from '@/components/driver/payment-sheet';
import { QueueScreen } from '@/components/driver/queue-screen';
import { ReorderSheet } from '@/components/driver/reorder-sheet';
import { ShiftAlertBanner } from '@/components/driver/shift-alert-banner';
import { StopSheet } from '@/components/driver/stop-sheet';
import { driverTransitions } from '@/api/transitions';
import type { ActiveStop, FailureReason, PaymentException } from '@/api/types';
import { useTheme } from '@/design/theme';
import { errorNotice } from '@/locale/error-message';
import { useLocale, useStrings } from '@/locale/locale-provider';
import {
  useComplete,
  useCoolerCheck,
  useReturn,
  useSetPriority,
} from '@/queue/mutations';
import { useQueueSlices } from '@/queue/use-queue';

/**
 * On the way — packages in the van (`picked_up`).
 *
 * Rendered in the order the server sent, which is priority first and then
 * `sequence_number`. The app never re-sorts by its own distance math, or the
 * driver's screen and the pharmacist's dashboard would show different routes
 * (PRD §3.1).
 *
 * This is also the screen that has to interrupt: an order added mid-shift is
 * only actionable if the driver learns about it while they are still out.
 *
 * The door flow lives here because it is one decision with three tails, and
 * splitting it across screens would lose the thread:
 *
 *   nothing owed          → complete
 *   money changes hands   → payment sheet → complete, in one transaction
 *   the client cannot pay → call the pharmacy → record what they said,
 *                           or bring it back with `payment_refused`
 */
type DoorStep =
  | { kind: 'closed' }
  | { kind: 'sheet'; id: string }
  | { kind: 'payment'; id: string }
  | { kind: 'exception'; id: string }
  | { kind: 'return'; id: string; reason?: FailureReason }
  | { kind: 'cooler'; id: string };

const RETURN_REASONS = [
  'customer_absent',
  'customer_refused',
  'wrong_address',
  'payment_refused',
  'other',
] as const satisfies readonly FailureReason[];

const PAYMENT_EXCEPTIONS = [
  'waived_by_pharmacy',
  'deferred_to_pharmacy',
] as const satisfies readonly PaymentException[];

export default function OnTheWayScreen() {
  const { query, slices } = useQueueSlices();
  const { locale } = useLocale();
  const t = useStrings();
  const theme = useTheme();

  const complete = useComplete();
  const returnOrder = useReturn();
  const cooler = useCoolerCheck();
  const priority = useSetPriority();

  const [step, setStep] = useState<DoorStep>({ kind: 'closed' });
  const [reordering, setReordering] = useState(false);

  const stops = slices.onTheWay;
  const open = 'id' in step ? stops.find((stop) => stop.id === step.id) : undefined;
  const pharmacyPhone = slices.pharmacy?.phone ?? null;

  const failure = complete.error ?? returnOrder.error ?? priority.error;
  const notice = failure ? errorNotice(failure, t) : null;

  function call(number: string | null) {
    if (number) void Linking.openURL(`tel:${number}`);
  }

  /** Where a stop goes when the driver taps Delivered. */
  function startComplete(stop: ActiveStop) {
    const owes =
      stop.amount_due !== null && stop.amount_due > 0 && !stop.payment_collected;
    if (owes) {
      setStep({ kind: 'payment', id: stop.id });
      return;
    }
    void finish(stop, () => complete.mutateAsync({ id: stop.id }));
  }

  /**
   * Run a transition, then decide whether the cooler prompt is owed.
   *
   * The prompt has to wait for the server. `cooler-check` is only valid once
   * the order is terminal, so firing it against the optimistic state answers
   * `409 ORDER_INVALID_TRANSITION` — this is the one place in the app where a
   * follow-up call genuinely cannot be optimistic.
   */
  async function finish(stop: ActiveStop, run: () => Promise<unknown>) {
    try {
      await run();
      setStep(
        stop.requires_cooler_bag ? { kind: 'cooler', id: stop.id } : { kind: 'closed' },
      );
    } catch {
      // `useQueueMutation` has already rolled the cache back and `notice`
      // renders the reason; leaving a modal open would hide it.
      setStep({ kind: 'closed' });
    }
  }

  return (
    <>
      <QueueScreen
        query={query}
        items={stops}
        keyExtractor={(stop) => stop.id}
        banner={
          <>
            <ShiftAlertBanner variant="return_to_pharmacy" />
            {notice ? (
              <Banner tone="danger" icon="alert-circle-outline" message={notice.message} />
            ) : null}
          </>
        }
        renderItem={(stop) => (
          <OrderCard
            stop={stop}
            locale={locale}
            onPress={() => setStep({ kind: 'sheet', id: stop.id })}
            // Long-press toggles priority: the employee's verbal flag reaches
            // the driver at the counter, but they act on it out here.
            onToggleSelect={() =>
              priority.mutate({ id: stop.id, isPriority: !stop.is_priority })
            }
            labels={{
              cooler: t.cooler,
              priority: t.priority,
              packages: t.packages,
              accessibilityPrefix: t.accessibilityPrefix,
            }}
          />
        )}
        footer={
          stops.length > 1 ? (
            <SecondaryAction
              label={t.reorderTitle}
              onPress={() => setReordering(true)}
              icon={<Ionicons name="swap-vertical" size={18} color={theme.ink.primary} />}
            />
          ) : null
        }
        emptyIcon="car-outline"
        emptyTitle={t.onTheWayEmptyTitle}
        emptyBody={t.onTheWayEmptyBody}
      />

      {/*
        The detail sheet is a modal held by this screen rather than its own
        route: the stop is read straight out of the cached queue, so there is
        no id in navigation params, no second request, and no window where the
        route exists but its data has been garbage-collected.
      */}
      {step.kind === 'sheet' && open ? (
        <StopSheet
          stop={open}
          locale={locale}
          transitions={driverTransitions(open.status)}
          busy={complete.isPending ? 'complete' : null}
          labels={{
            status: t.statusOnTheWay,
            client: t.client,
            callClient: t.callClient,
            callPharmacy: t.callPharmacy,
            window: t.window,
            amountDue: t.amountDue,
            paymentAtDoor: t.paymentAtDoor,
            cooler: t.cooler,
            pickup: t.takeCharge,
            delivered: t.delivered,
            returnOrder: t.returnOrder,
            handover: t.handedBack,
          }}
          onDismiss={() => setStep({ kind: 'closed' })}
          onCallClient={() => call(open.phone_number)}
          onCallPharmacy={() => call(pharmacyPhone)}
          onTransition={(transition) => {
            if (transition === 'complete') startComplete(open);
            if (transition === 'return') setStep({ kind: 'return', id: open.id });
          }}
        />
      ) : null}

      {step.kind === 'payment' && open ? (
        <PaymentSheet
          visible
          amountDue={open.amount_due ?? 0}
          locale={locale}
          busy={complete.isPending}
          labels={{
            amountDue: t.amountDue,
            amountCollected: t.amountCollected,
            cash: t.cash,
            card: t.card,
            confirm: t.confirmDelivery,
            cannotPay: t.cannotPay,
            cancel: t.cancel,
          }}
          onCancel={() => setStep({ kind: 'closed' })}
          onCannotPay={() => setStep({ kind: 'exception', id: open.id })}
          onConfirm={(payment) =>
            void finish(open, () =>
              complete.mutateAsync({
                id: open.id,
                outcome: { kind: 'paid', payment },
              }),
            )
          }
        />
      ) : null}

      {step.kind === 'exception' && open ? (
        <ChoiceSheet
          visible
          title={t.cannotPay}
          hint={t.callPharmacyFirst}
          /*
            The call button leads, and it is the primary action. The workflow
            is explicit that the pharmacy decides — "le livreur doit appeler la
            pharmacie et demander quoi faire" — so the options below record an
            answer rather than offer the driver a choice. Both end up on the
            pharmacy's exceptions report under this driver's name.
          */
          lead={
            <PrimaryAction
              label={t.callPharmacy}
              onPress={() => call(pharmacyPhone)}
              icon={<Ionicons name="call" size={20} color={theme.palette.onAccent} />}
            />
          }
          choices={PAYMENT_EXCEPTIONS.map((value) => ({
            value,
            label: t.paymentExceptions[value],
          }))}
          busy={complete.isPending}
          labels={{
            note: t.noteOptional,
            remaining: t.noteRemaining,
            confirm: t.confirmDelivery,
            cancel: t.bringItBack,
          }}
          onCancel={() =>
            setStep({ kind: 'return', id: open.id, reason: 'payment_refused' })
          }
          onConfirm={(exception, note) =>
            void finish(open, () =>
              complete.mutateAsync({
                id: open.id,
                outcome: { kind: 'exception', exception, note },
              }),
            )
          }
        />
      ) : null}

      {step.kind === 'return' && open ? (
        <ChoiceSheet
          visible
          destructive
          title={t.returnReasonTitle}
          hint={t.returnReasonHint}
          initial={step.reason}
          choices={RETURN_REASONS.map((value) => ({
            value,
            label: t.failureReasons[value],
          }))}
          busy={returnOrder.isPending}
          labels={{
            note: t.noteOptional,
            remaining: t.noteRemaining,
            confirm: t.confirmReturn,
            cancel: t.cancel,
          }}
          onCancel={() => setStep({ kind: 'closed' })}
          onConfirm={(reason, note) =>
            void finish(open, () =>
              returnOrder.mutateAsync({ id: open.id, body: { reason, note } }),
            )
          }
        />
      ) : null}

      <CoolerPrompt
        visible={step.kind === 'cooler'}
        busy={cooler.isPending}
        labels={{ question: t.coolerQuestion, yes: t.yes, no: t.no, later: t.later }}
        onDismiss={() => setStep({ kind: 'closed' })}
        onAnswer={(confirmed) => {
          if (step.kind === 'cooler') cooler.mutate({ id: step.id, confirmed });
          setStep({ kind: 'closed' });
        }}
      />

      <ReorderSheet visible={reordering} onClose={() => setReordering(false)} />
    </>
  );
}
