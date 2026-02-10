export type CalendarGuestInput = {
  id?: number;
  name: string;
  email?: string;
  phone?: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type CalendarEvent = {
  id: number;
  title: string;
  description?: string | null;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  location?: string | null;
  meeting_link?: string | null;
  reminder_minutes_before?: number | null;
  notify_by_email?: boolean;
  notify_by_phone?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  guests?: CalendarGuestInput[];
};

export type CalendarEventPayload = {
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  location?: string;
  meeting_link?: string;
  reminder_minutes_before?: number;
  notify_by_email?: boolean;
  notify_by_phone?: boolean;
  user_id?: number;
  guests?: CalendarGuestInput[];
};

const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) {
        message = data.error as string;
      }
    } catch {
      // ignore body parse errors
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
};

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const fetchCalendarEvents = async (options: {
  institutionId: number;
  start?: string;
  end?: string;
}): Promise<CalendarEvent[]> => {
  const query = buildQuery({
    institutionId: options.institutionId,
    start: options.start,
    end: options.end,
  });
  return handleResponse<CalendarEvent[]>(
    await fetch(`/api/v1/calendar/events${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );
};

export const createCalendarEventClient = async (
  institutionId: number,
  payload: CalendarEventPayload,
) => {
  const query = buildQuery({ institutionId });
  return handleResponse<{ id: number; status: string }>(
    await fetch(`/api/v1/calendar/events${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
};

export const updateCalendarEventClient = async (
  institutionId: number,
  eventId: number,
  payload: Partial<CalendarEventPayload>,
) => {
  const query = buildQuery({ institutionId });
  return handleResponse<{ status: string }>(
    await fetch(`/api/v1/calendar/events/${eventId}${query}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }),
  );
};

export const deleteCalendarEventClient = async (
  institutionId: number,
  eventId: number,
) => {
  const query = buildQuery({ institutionId });
  return handleResponse<{ status: string }>(
    await fetch(`/api/v1/calendar/events/${eventId}${query}`, {
      method: "DELETE",
    }),
  );
};

export const addCalendarEventGuestClient = async (
  institutionId: number,
  eventId: number,
  guest: CalendarGuestInput,
) => {
  const query = buildQuery({ institutionId });
  return handleResponse<{ id: number; status: string }>(
    await fetch(`/api/v1/calendar/events/${eventId}/guests${query}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: guest.name,
        email: guest.email,
        phone: guest.phone,
      }),
    }),
  );
};

export const fetchCalendarEventById = async (
  institutionId: number,
  eventId: number,
): Promise<CalendarEvent> => {
  const query = buildQuery({ institutionId });
  return handleResponse<CalendarEvent>(
    await fetch(`/api/v1/calendar/events/${eventId}${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }),
  );
};
