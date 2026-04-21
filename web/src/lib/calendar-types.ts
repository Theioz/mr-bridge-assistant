export type CalendarType = "primary" | "birthday" | "holiday" | "other";

export interface CalendarRangeEvent {
  eventId: string;
  title: string;
  start: string; // ISO dateTime or YYYY-MM-DD for all-day
  end: string;
  allDay: boolean;
  calendarName: string;
  calendarType: CalendarType;
  location?: string | null;
}

export interface CalendarRangeResponse {
  events: CalendarRangeEvent[];
  not_connected?: boolean;
  error?: string;
}
