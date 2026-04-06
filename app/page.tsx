"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentDoctorId,
  getCurrentUserProfile,
  supabase,
} from "@/src/lib/supabase";

type Client = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  status: string | null;
  notes: string | null;
  doctor_id: string | null;
};

type Doctor = {
  id: string;
  display_name: string;
  profile_id: string;
};

export default function HomePage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "doctor" | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [status, setStatus] = useState("active");
  const [notes, setNotes] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([]);
  const [bulkDoctorId, setBulkDoctorId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const doctorNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const doctor of doctors) {
      map[doctor.id] = doctor.display_name;
    }
    return map;
  }, [doctors]);

  const fetchDoctors = async () => {
    const { data, error } = await supabase
      .from("doctors")
      .select("id, display_name, profile_id")
      .order("display_name", { ascending: true });

    if (error) {
      console.error("Ошибка загрузки doctors:", error.message);
      setDoctors([]);
      return;
    }

    setDoctors(data ?? []);
  };

  const fetchClientsForDoctor = async (currentDoctorId: string) => {
    const { data: links, error: linksError } = await supabase
      .from("client_doctors")
      .select("client_id")
      .eq("doctor_id", currentDoctorId);

    if (linksError) {
      console.error("Ошибка загрузки client_doctors:", linksError.message);
      setClients([]);
      return;
    }

    const clientIds = (links ?? []).map((item: { client_id: string }) => item.client_id);

    if (clientIds.length === 0) {
      setClients([]);
      return;
    }

    const { data: clientsData, error: clientsError } = await supabase
      .from("clients")
      .select("*")
      .in("id", clientIds)
      .order("created_at", { ascending: false });

    if (clientsError) {
      console.error("Ошибка загрузки клиентов врача:", clientsError.message);
      setClients([]);
      return;
    }

    setClients(clientsData ?? []);
  };

  const fetchAllClients = async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Ошибка загрузки всех клиентов:", error.message);
      setClients([]);
      return;
    }

    setClients(data ?? []);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setFormError(null);

      const current = await getCurrentUserProfile();

      if (!current) {
        router.push("/login");
        return;
      }

      const currentRole = current.profile.role as "admin" | "doctor";
      setRole(currentRole);
      setCurrentUserName(current.profile.full_name || "");

      if (currentRole === "admin") {
        setDoctorId(null);
        await fetchDoctors();
        await fetchAllClients();
        setLoading(false);
        return;
      }

      const currentDoctorId = await getCurrentDoctorId();

      if (!currentDoctorId) {
        setFormError("Для этого пользователя не найден doctor profile");
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

      await fetchClientsForDoctor(currentDoctorId);
      setLoading(false);
    };

    init();
  }, [router]);

  const filteredClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return clients;

    return clients.filter((client) =>
      client.full_name?.toLowerCase().includes(query)
    );
  }, [clients, search]);

  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((client) => selectedClientIds.includes(client.id));

  const toggleClientSelection = (clientId: string) => {
    setSelectedClientIds((prev) =>
      prev.includes(clientId)
        ? prev.filter((id) => id !== clientId)
        : [...prev, clientId]
    );
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      const filteredIds = filteredClients.map((client) => client.id);
      setSelectedClientIds((prev) =>
        prev.filter((id) => !filteredIds.includes(id))
      );
    } else {
      const filteredIds = filteredClients.map((client) => client.id);
      setSelectedClientIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const handleBulkReassign = async () => {
    setBulkMessage(null);

    if (role !== "admin") {
      setBulkMessage("Только admin может переназначать клиентов");
      return;
    }

    if (selectedClientIds.length === 0) {
      setBulkMessage("Выбери хотя бы одного клиента");
      return;
    }

    if (!bulkDoctorId) {
      setBulkMessage("Выбери доктора");
      return;
    }

    setBulkLoading(true);

    const inserts = selectedClientIds.map((clientId) => ({
      client_id: clientId,
      doctor_id: bulkDoctorId,
    }));

    const { error } = await supabase
      .from("client_doctors")
      .insert(inserts);

    setBulkLoading(false);

    if (error) {
      console.error("BULK ACCESS ADD ERROR:", error);
      setBulkMessage(`Ошибка: ${error.message}`);
      return;
    }

    setBulkMessage("Доступ доктору выдан");
    setSelectedClientIds([]);
    setBulkDoctorId("");
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!fullName.trim()) {
      setFormError("Введите имя клиента");
      return;
    }

    let targetDoctorId: string | null = null;

    if (role === "admin") {
      if (!selectedDoctorId) {
        setFormError("Выбери доктора");
        return;
      }
      targetDoctorId = selectedDoctorId;
    } else {
      if (!doctorId) {
        setFormError("doctor_id не найден");
        return;
      }
      targetDoctorId = doctorId;
    }

    setCreating(true);

    const { data: insertedClient, error: clientError } = await supabase
      .from("clients")
      .insert({
        doctor_id: targetDoctorId,
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        birth_date: birthDate || null,
        status,
        notes: notes.trim() || null,
      })
      .select()
      .single();

    if (clientError || !insertedClient) {
      setCreating(false);
      setFormError(clientError?.message || "Ошибка создания клиента");
      return;
    }

    const { error: linkError } = await supabase
      .from("client_doctors")
      .insert({
        client_id: insertedClient.id,
        doctor_id: targetDoctorId,
      });

    setCreating(false);

    if (linkError) {
      setFormError(linkError.message);
      return;
    }

    setFullName("");
    setPhone("");
    setBirthDate("");
    setStatus("active");
    setNotes("");
    setSelectedDoctorId("");

    if (role === "admin") {
      await fetchAllClients();
    } else if (doctorId) {
      await fetchClientsForDoctor(doctorId);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-neutral-900">Beauty CRM</h1>
            <p className="mt-2 text-neutral-600">
              {role === "admin"
                ? `Режим администратора: ${currentUserName || "—"}`
                : `Клиенты доктора: ${currentUserName || "—"}`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => router.push("/schedule")}
              className="rounded-xl border border-neutral-300 px-4 py-2 hover:bg-neutral-100"
            >
              Календарь визитов
            </button>

            <button
              onClick={handleLogout}
              className="rounded-xl border border-neutral-300 px-4 py-2 hover:bg-neutral-100"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-neutral-900">
            Добавить клиента
          </h2>

          <form onSubmit={handleCreateClient} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Имя клиента
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
                placeholder="Например: Анна Иванова"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Телефон
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
                placeholder="+79990000000"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Дата рождения
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Статус
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="vip">vip</option>
              </select>
            </div>

            {role === "admin" && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-neutral-700">
                  Доктор
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
                >
                  <option value="">Выбери доктора</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-neutral-700">
                Заметки
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
                placeholder="Заметки о клиенте..."
              />
            </div>

            <div className="md:col-span-2">
              {formError && (
                <p className="mb-3 text-sm text-red-600">{formError}</p>
              )}

              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-neutral-900 px-5 py-3 text-white transition hover:bg-neutral-800 disabled:opacity-60"
              >
                {creating ? "Создание..." : "Добавить клиента"}
              </button>
            </div>
          </form>
        </div>

        {role === "admin" && (
          <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-neutral-900">
              Массовая выдача доступа доктору
            </h2>

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <select
                value={bulkDoctorId}
                onChange={(e) => setBulkDoctorId(e.target.value)}
                className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500"
              >
                <option value="">Выбери доктора</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.display_name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleBulkReassign}
                disabled={bulkLoading}
                className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
              >
                {bulkLoading ? "Выдача доступа..." : "Выдать доступ выбранным"}
              </button>
            </div>

            <div className="mt-3 text-sm text-neutral-600">
              Выбрано клиентов: {selectedClientIds.length}
            </div>

            {bulkMessage && <p className="mt-3 text-sm">{bulkMessage}</p>}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-neutral-200 px-6 py-4 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold text-neutral-900">
              {role === "admin" ? "Все клиенты" : "Мои клиенты"}
            </h2>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени..."
              className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-neutral-500 md:w-80"
            />
          </div>

          {loading && <div className="px-6 py-8 text-neutral-600">Загрузка...</div>}

          {!loading && filteredClients.length === 0 && (
            <div className="px-6 py-8 text-neutral-600">Клиенты не найдены</div>
          )}

          {!loading && filteredClients.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead className="bg-neutral-100 text-sm text-neutral-700">
                  <tr>
                    {role === "admin" && (
                      <th className="px-6 py-4 font-medium">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAllFiltered}
                        />
                      </th>
                    )}
                    <th className="px-6 py-4 font-medium">Имя</th>
                    <th className="px-6 py-4 font-medium">Телефон</th>
                    <th className="px-6 py-4 font-medium">Дата рождения</th>
                    <th className="px-6 py-4 font-medium">Статус</th>
                    {role === "admin" && (
                      <th className="px-6 py-4 font-medium">Основной доктор</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
                    <tr
                      key={client.id}
                      className="border-t border-neutral-200 text-sm text-neutral-800 hover:bg-neutral-100"
                    >
                      {role === "admin" && (
                        <td
                          className="px-6 py-4"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedClientIds.includes(client.id)}
                            onChange={() => toggleClientSelection(client.id)}
                          />
                        </td>
                      )}
                      <td
                        className="cursor-pointer px-6 py-4 font-medium"
                        onClick={() => router.push(`/client/${client.id}`)}
                      >
                        {client.full_name}
                      </td>
                      <td
                        className="cursor-pointer px-6 py-4"
                        onClick={() => router.push(`/client/${client.id}`)}
                      >
                        {client.phone || "—"}
                      </td>
                      <td
                        className="cursor-pointer px-6 py-4"
                        onClick={() => router.push(`/client/${client.id}`)}
                      >
                        {client.birth_date || "—"}
                      </td>
                      <td
                        className="cursor-pointer px-6 py-4"
                        onClick={() => router.push(`/client/${client.id}`)}
                      >
                        {client.status || "—"}
                      </td>
                      {role === "admin" && (
                        <td
                          className="cursor-pointer px-6 py-4"
                          onClick={() => router.push(`/client/${client.id}`)}
                        >
                          {client.doctor_id
                            ? doctorNameMap[client.doctor_id] || "—"
                            : "—"}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}