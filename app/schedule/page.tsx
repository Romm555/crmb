"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentDoctorId,
  getCurrentUserProfile,
  supabase,
} from "@/src/lib/supabase";

type VisitRow = {
  id: string;
  visit_date: string | null;
  procedure_name: string;
  notes: string | null;
  doctor_id: string;
  client_id: string;
};

type Client = {
  id: string;
  full_name: string;
};

type Doctor = {
  id: string;
  display_name: string;
};

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

function formatDateInput(date: Date) {
  if (!isValidDate(date)) {
    return "";
  }

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateOnly(dateStr: string) {
  if (!dateStr) return null;

  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  return isValidDate(date) ? date : null;
}

function getDayRange(dateStr: string) {
  return {
    start: `${dateStr}T00:00:00`,
    end: `${dateStr}T23:59:59`,
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getStartOfWeek(date: Date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getWeekDates(baseDateStr: string) {
  const parsed = parseDateOnly(baseDateStr);
  if (!parsed) return [];

  const start = getStartOfWeek(parsed);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function formatWeekdayLabel(date: Date) {
  if (!isValidDate(date)) return "—";

  return date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatVisitTime(value: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (!isValidDate(date)) return "—";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SchedulePage() {
  const router = useRouter();

  const [role, setRole] = useState<"admin" | "doctor" | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");

  const [selectedDate, setSelectedDate] = useState(formatDateInput(new Date()));
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState("");

  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const clientNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const client of clients) {
      map[client.id] = client.full_name;
    }
    return map;
  }, [clients]);

  const doctorNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const doctor of doctors) {
      map[doctor.id] = doctor.display_name;
    }
    return map;
  }, [doctors]);

  const sortedVisits = useMemo(() => {
    return [...visits].sort((a, b) => {
      const aTime =
        a.visit_date && isValidDate(new Date(a.visit_date))
          ? new Date(a.visit_date).getTime()
          : 0;
      const bTime =
        b.visit_date && isValidDate(new Date(b.visit_date))
          ? new Date(b.visit_date).getTime()
          : 0;
      return aTime - bTime;
    });
  }, [visits]);

  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const filteredVisits = useMemo(() => {
    if (role !== "admin") return sortedVisits;
    if (!selectedDoctorFilter) return sortedVisits;
    return sortedVisits.filter((visit) => visit.doctor_id === selectedDoctorFilter);
  }, [sortedVisits, role, selectedDoctorFilter]);

  const visitsByDay = useMemo(() => {
    const groups: Record<string, VisitRow[]> = {};

    for (const visit of filteredVisits) {
      if (!visit.visit_date) continue;

      const parsed = new Date(visit.visit_date);
      if (!isValidDate(parsed)) continue;

      const dayKey = formatDateInput(parsed);
      if (!dayKey) continue;

      if (!groups[dayKey]) groups[dayKey] = [];
      groups[dayKey].push(visit);
    }

    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        const aTime =
          a.visit_date && isValidDate(new Date(a.visit_date))
            ? new Date(a.visit_date).getTime()
            : 0;
        const bTime =
          b.visit_date && isValidDate(new Date(b.visit_date))
            ? new Date(b.visit_date).getTime()
            : 0;
        return aTime - bTime;
      });
    }

    return groups;
  }, [filteredVisits]);

  const fetchDoctors = async () => {
    const { data, error } = await supabase
      .from("doctors")
      .select("id, display_name")
      .order("display_name", { ascending: true });

    if (error) {
      console.error("DOCTORS LOAD ERROR:", error.message || error);
      setDoctors([]);
      return;
    }

    setDoctors(data || []);
  };

  const fetchClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, full_name");

    if (error) {
      console.error("CLIENTS LOAD ERROR:", error.message || error);
      setClients([]);
      return;
    }

    setClients(data || []);
  };

  const fetchVisitsForRange = async (
    start: string,
    end: string,
    currentRole: "admin" | "doctor",
    currentDoctorId: string | null
  ) => {
    let query = supabase
      .from("visits")
      .select("id, visit_date, procedure_name, notes, doctor_id, client_id")
      .gte("visit_date", start)
      .lte("visit_date", end);

    if (currentRole === "doctor" && currentDoctorId) {
      query = query.eq("doctor_id", currentDoctorId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("VISITS LOAD ERROR:", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        start,
        end,
        currentRole,
        currentDoctorId,
      });
      setVisits([]);
      return;
    }

    setVisits(data || []);
  };

  const reloadVisits = async (
    currentRole: "admin" | "doctor",
    currentDoctorId: string | null,
    currentDate: string,
    currentViewMode: "day" | "week"
  ) => {
    const parsed = parseDateOnly(currentDate);
    if (!parsed) {
      setVisits([]);
      return;
    }

    if (currentViewMode === "day") {
      const safeDate = formatDateInput(parsed);
      const { start, end } = getDayRange(safeDate);
      await fetchVisitsForRange(start, end, currentRole, currentDoctorId);
      return;
    }

    const dates = getWeekDates(currentDate);
    if (dates.length === 0) {
      setVisits([]);
      return;
    }

    const start = `${formatDateInput(dates[0])}T00:00:00`;
    const end = `${formatDateInput(dates[6])}T23:59:59`;
    await fetchVisitsForRange(start, end, currentRole, currentDoctorId);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);

      const current = await getCurrentUserProfile();

      if (!current) {
        router.push("/login");
        return;
      }

      const currentRole = current.profile.role as "admin" | "doctor";
      setRole(currentRole);
      setCurrentUserName(current.profile.full_name || "");

      await Promise.all([fetchClients(), fetchDoctors()]);

      if (currentRole === "admin") {
        await reloadVisits("admin", null, selectedDate, viewMode);
        setLoading(false);
        return;
      }

      const currentDoctorId = await getCurrentDoctorId();

      if (!currentDoctorId) {
        setLoading(false);
        return;
      }

      setDoctorId(currentDoctorId);

      const { data: doctorData } = await supabase
        .from("doctors")
        .select("display_name")
        .eq("id", currentDoctorId)
        .single();

      if (doctorData?.display_name) {
        setCurrentUserName(doctorData.display_name);
      }

      await reloadVisits("doctor", currentDoctorId, selectedDate, viewMode);
      setLoading(false);
    };

    init();
  }, [router]);

  useEffect(() => {
    if (!role) return;

    const reload = async () => {
      setLoading(true);
      await reloadVisits(
        role,
        role === "doctor" ? doctorId : null,
        selectedDate,
        viewMode
      );
      setLoading(false);
    };

    reload();
  }, [selectedDate, viewMode, role, doctorId]);

  const goToday = () => {
    setSelectedDate(formatDateInput(new Date()));
    setViewMode("day");
  };

  const goTomorrow = () => {
    setSelectedDate(formatDateInput(addDays(new Date(), 1)));
    setViewMode("day");
  };

  const goYesterday = () => {
    setSelectedDate(formatDateInput(addDays(new Date(), -1)));
    setViewMode("day");
  };

  const goThisWeek = () => {
    setSelectedDate(formatDateInput(new Date()));
    setViewMode("week");
  };

  const renderVisitCard = (visit: VisitRow) => {
    return (
      <button
        key={visit.id}
        onClick={() => router.push(`/client/${visit.client_id}`)}
        className="w-full rounded-xl border p-4 text-left hover:bg-neutral-50"
      >
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-lg font-semibold">
              {formatVisitTime(visit.visit_date)}
            </p>
            <p className="font-medium">
              {clientNameMap[visit.client_id] || "Неизвестный клиент"}
            </p>
            <p className="text-neutral-700">{visit.procedure_name}</p>
            <p className="text-sm text-neutral-500">
              Доктор: {doctorNameMap[visit.doctor_id] || "—"}
            </p>
          </div>

          {visit.notes && (
            <div className="max-w-xl whitespace-pre-wrap text-sm text-neutral-600">
              {visit.notes}
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-2">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-neutral-600 hover:text-black w-fit"
          >
            ← Назад
          </button>

          <h1 className="text-3xl font-bold text-neutral-900">Календарь визитов</h1>

          <p className="text-neutral-600">
            {role === "admin"
              ? `Администратор: ${currentUserName || "—"}`
              : `Доктор: ${currentUserName || "—"}`}
          </p>
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={goYesterday}
                className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
              >
                Вчера
              </button>

              <button
                onClick={goToday}
                className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
              >
                Сегодня
              </button>

              <button
                onClick={goTomorrow}
                className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
              >
                Завтра
              </button>

              <button
                onClick={goThisWeek}
                className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
              >
                Эта неделя
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Дата
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-xl border px-4 py-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Режим
                </label>
                <select
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as "day" | "week")}
                  className="w-full rounded-xl border px-4 py-3"
                >
                  <option value="day">День</option>
                  <option value="week">Неделя</option>
                </select>
              </div>

              {role === "admin" && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-neutral-700">
                    Фильтр по доктору
                  </label>
                  <select
                    value={selectedDoctorFilter}
                    onChange={(e) => setSelectedDoctorFilter(e.target.value)}
                    className="w-full rounded-xl border px-4 py-3"
                  >
                    <option value="">Все доктора</option>
                    {doctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="text-sm text-neutral-500">
              Всего визитов: {filteredVisits.length}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-6">
          {loading && <p className="text-neutral-500">Загрузка...</p>}

          {!loading && viewMode === "day" && (
            <>
              <h2 className="mb-4 text-xl font-semibold">
                Расписание на {selectedDate}
              </h2>

              {filteredVisits.length === 0 ? (
                <p className="text-neutral-500">На этот день визитов нет</p>
              ) : (
                <div className="space-y-4">
                  {filteredVisits.map((visit) => renderVisitCard(visit))}
                </div>
              )}
            </>
          )}

          {!loading && viewMode === "week" && (
            <>
              <h2 className="mb-4 text-xl font-semibold">Расписание на неделю</h2>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {weekDates.map((date) => {
                  const dayKey = formatDateInput(date);
                  const dayVisits = dayKey ? visitsByDay[dayKey] || [] : [];

                  return (
                    <div key={dayKey || Math.random()} className="rounded-xl border p-4">
                      <h3 className="mb-3 font-semibold">
                        {formatWeekdayLabel(date)}
                      </h3>

                      {dayVisits.length === 0 ? (
                        <p className="text-sm text-neutral-500">Нет визитов</p>
                      ) : (
                        <div className="space-y-3">
                          {dayVisits.map((visit) => renderVisitCard(visit))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}