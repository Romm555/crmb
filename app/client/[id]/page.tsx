"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getCurrentDoctorId, getCurrentUserProfile, supabase } from "@/src/lib/supabase";

type Client = {
  id: string;
  full_name: string;
  phone: string | null;
  birth_date: string | null;
  status: string | null;
  notes: string | null;
  doctor_id: string;
};

type Visit = {
  id: string;
  visit_date: string | null;
  procedure_name: string;
  notes: string | null;
  doctor_id: string;
};

type ClientFile = {
  id: string;
  storage_path: string;
  comment: string | null;
  created_at: string;
  doctor_id: string;
};

type Doctor = {
  id: string;
  display_name: string;
  profile_id: string;
};

type ClientDoctorLink = {
  id: string;
  client_id: string;
  doctor_id: string;
};

const BUCKET_NAME = "client-files";

export default function ClientPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [files, setFiles] = useState<ClientFile[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [clientDoctors, setClientDoctors] = useState<ClientDoctorLink[]>([]);
  const [loading, setLoading] = useState(true);

  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [role, setRole] = useState<"admin" | "doctor" | null>(null);
  const [currentUserName, setCurrentUserName] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [clientMessage, setClientMessage] = useState<string | null>(null);

  const [editFullName, setEditFullName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editNotes, setEditNotes] = useState("");
  const [editDoctorId, setEditDoctorId] = useState("");

  const [visitDate, setVisitDate] = useState("");
  const [procedure, setProcedure] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [visitMessage, setVisitMessage] = useState<string | null>(null);

  const [editingVisitId, setEditingVisitId] = useState<string | null>(null);
  const [editVisitDate, setEditVisitDate] = useState("");
  const [editProcedure, setEditProcedure] = useState("");
  const [editVisitNotes, setEditVisitNotes] = useState("");
  const [savingVisitId, setSavingVisitId] = useState<string | null>(null);
  const [deletingVisitId, setDeletingVisitId] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileComment, setFileComment] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);

  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingFileComment, setEditingFileComment] = useState("");
  const [savingFileId, setSavingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const [accessDoctorId, setAccessDoctorId] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessMessage, setAccessMessage] = useState<string | null>(null);
  const [removingDoctorId, setRemovingDoctorId] = useState<string | null>(null);

  const doctorNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const doctor of doctors) {
      map[doctor.id] = doctor.display_name;
    }
    return map;
  }, [doctors]);

  const linkedDoctorIds = useMemo(
    () => clientDoctors.map((item) => item.doctor_id),
    [clientDoctors]
  );

  const availableDoctorsToAdd = useMemo(() => {
    return doctors.filter((doctor) => !linkedDoctorIds.includes(doctor.id));
  }, [doctors, linkedDoctorIds]);

  const fillEditForm = (clientData: Client) => {
    setEditFullName(clientData.full_name || "");
    setEditPhone(clientData.phone || "");
    setEditBirthDate(clientData.birth_date || "");
    setEditStatus(clientData.status || "active");
    setEditNotes(clientData.notes || "");
    setEditDoctorId(clientData.doctor_id || "");
  };

  const fetchDoctors = async () => {
    const { data, error } = await supabase
      .from("doctors")
      .select("id, display_name, profile_id")
      .order("display_name", { ascending: true });

    if (error) {
      console.error("DOCTORS LOAD ERROR:", error);
      setDoctors([]);
      return;
    }

    setDoctors(data || []);
  };

  const fetchClientDoctors = async () => {
    const { data, error } = await supabase
      .from("client_doctors")
      .select("*")
      .eq("client_id", clientId);

    if (error) {
      console.error("CLIENT_DOCTORS LOAD ERROR:", error);
      setClientDoctors([]);
      return;
    }

    setClientDoctors(data || []);
  };

  const fetchData = async (
    currentRole: "admin" | "doctor",
    currentDoctorId: string | null
  ) => {
    setLoading(true);

    try {
      await fetchDoctors();
      await fetchClientDoctors();

      let clientQuery = supabase
        .from("clients")
        .select("*")
        .eq("id", clientId);

      if (currentRole === "doctor" && currentDoctorId) {
        const { data: allowedLink } = await supabase
          .from("client_doctors")
          .select("id")
          .eq("client_id", clientId)
          .eq("doctor_id", currentDoctorId)
          .maybeSingle();

        if (!allowedLink) {
          setClient(null);
          setVisits([]);
          setFiles([]);
          setLoading(false);
          return;
        }
      }

      const { data: clientData, error: clientError } = await clientQuery.single();

      if (clientError) {
        console.error("CLIENT LOAD ERROR:", clientError);
        setClient(null);
        setVisits([]);
        setFiles([]);
        return;
      }

      setClient(clientData);
      fillEditForm(clientData);

      let visitsQuery = supabase
        .from("visits")
        .select("*")
        .eq("client_id", clientId)
        .order("visit_date", { ascending: false });

      if (currentRole === "doctor" && currentDoctorId) {
        visitsQuery = visitsQuery.eq("doctor_id", currentDoctorId);
      }

      const { data: visitsData, error: visitsError } = await visitsQuery;

      if (visitsError) {
        console.error("VISITS LOAD ERROR:", visitsError);
        setVisits([]);
      } else {
        setVisits(visitsData || []);
      }

      let filesQuery = supabase
        .from("client_files")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (currentRole === "doctor" && currentDoctorId) {
        filesQuery = filesQuery.eq("doctor_id", currentDoctorId);
      }

      const { data: filesData, error: filesError } = await filesQuery;

      if (filesError) {
        console.error("FILES LOAD ERROR:", filesError);
        setFiles([]);
      } else {
        setFiles(filesData || []);
      }
    } catch (error) {
      console.error("FETCH DATA ERROR:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
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
        await fetchData("admin", null);
        return;
      }

      const currentDoctorId = await getCurrentDoctorId();

      if (!currentDoctorId) {
        setLoading(false);
        setVisitMessage("doctor_id не найден");
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

      await fetchData("doctor", currentDoctorId);
    };

    if (clientId) {
      init();
    }
  }, [clientId, router]);

  const refreshCurrentPageData = async () => {
    if (role === "admin") {
      await fetchData("admin", null);
    } else {
      await fetchData("doctor", doctorId);
    }
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setClientMessage(null);

    if (!editFullName.trim()) {
      setClientMessage("Введите имя клиента");
      return;
    }

    if (role === "admin" && !editDoctorId) {
      setClientMessage("Выбери основного доктора");
      return;
    }

    setSavingClient(true);

    const updatePayload: {
      full_name: string;
      phone: string | null;
      birth_date: string | null;
      status: string;
      notes: string | null;
      doctor_id?: string;
    } = {
      full_name: editFullName.trim(),
      phone: editPhone.trim() || null,
      birth_date: editBirthDate || null,
      status: editStatus,
      notes: editNotes.trim() || null,
    };

    if (role === "admin") {
      updatePayload.doctor_id = editDoctorId;
    }

    const { error } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", clientId);

    setSavingClient(false);

    if (error) {
      console.error("CLIENT UPDATE ERROR:", error);
      setClientMessage(`Ошибка: ${error.message}`);
      return;
    }

    setClientMessage("Клиент сохранён");
    setIsEditing(false);
    await refreshCurrentPageData();
  };

  const handleAddVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVisitMessage(null);

    if (!client) {
      setVisitMessage("Клиент не найден");
      return;
    }

    const targetDoctorId = role === "admin" ? client.doctor_id : doctorId;

    if (!targetDoctorId) {
      setVisitMessage("doctor_id не найден");
      return;
    }

    if (!visitDate || !procedure.trim()) {
      setVisitMessage("Заполни дату и процедуру");
      return;
    }

    const { error } = await supabase.from("visits").insert({
      client_id: clientId,
      doctor_id: targetDoctorId,
      visit_date: visitDate,
      procedure_name: procedure.trim(),
      notes: visitNotes.trim() || null,
    });

    if (error) {
      setVisitMessage(`Ошибка: ${error.message}`);
      return;
    }

    setVisitDate("");
    setProcedure("");
    setVisitNotes("");
    setVisitMessage("Визит добавлен");

    await refreshCurrentPageData();
  };

  const handleStartEditVisit = (visit: Visit) => {
    setEditingVisitId(visit.id);

    if (visit.visit_date) {
      const parsed = new Date(visit.visit_date);

      if (!Number.isNaN(parsed.getTime())) {
        const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
        setEditVisitDate(local.toISOString().slice(0, 16));
      } else {
        setEditVisitDate("");
      }
    } else {
      setEditVisitDate("");
    }

    setEditProcedure(visit.procedure_name || "");
    setEditVisitNotes(visit.notes || "");
    setVisitMessage(null);
  };

  const handleCancelEditVisit = () => {
    setEditingVisitId(null);
    setEditVisitDate("");
    setEditProcedure("");
    setEditVisitNotes("");
  };

  const handleSaveVisit = async (visitId: string) => {
    setVisitMessage(null);

    if (!editVisitDate || !editProcedure.trim()) {
      setVisitMessage("Заполни дату и процедуру");
      return;
    }

    setSavingVisitId(visitId);

    const { error } = await supabase
      .from("visits")
      .update({
        visit_date: editVisitDate,
        procedure_name: editProcedure.trim(),
        notes: editVisitNotes.trim() || null,
      })
      .eq("id", visitId);

    setSavingVisitId(null);

    if (error) {
      console.error("VISIT UPDATE ERROR:", error);
      setVisitMessage(`Ошибка: ${error.message}`);
      return;
    }

    setEditingVisitId(null);
    setEditVisitDate("");
    setEditProcedure("");
    setEditVisitNotes("");
    setVisitMessage("Визит сохранён");
    await refreshCurrentPageData();
  };

  const handleDeleteVisit = async (visitId: string) => {
    const confirmed = window.confirm("Удалить визит?");
    if (!confirmed) return;

    setDeletingVisitId(visitId);
    setVisitMessage(null);

    const { error } = await supabase
      .from("visits")
      .delete()
      .eq("id", visitId);

    setDeletingVisitId(null);

    if (error) {
      console.error("VISIT DELETE ERROR:", error);
      setVisitMessage(`Ошибка: ${error.message}`);
      return;
    }

    setVisitMessage("Визит удалён");
    await refreshCurrentPageData();
  };

  const handleFileUpload = async () => {
    if (!client) {
      setFileMessage("Клиент не найден");
      return;
    }

    const targetDoctorId = role === "admin" ? client.doctor_id : doctorId;

    if (!targetDoctorId) {
      setFileMessage("doctor_id не найден");
      return;
    }

    if (!selectedFile) {
      setFileMessage("Сначала выбери файл");
      return;
    }

    setUploading(true);
    setFileMessage(null);

    try {
      const fileExt = selectedFile.name.split(".").pop();
      const fileName = `${clientId}/${Date.now()}.${fileExt}`;

      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, selectedFile);

      if (storageError) {
        setFileMessage(storageError.message);
        setUploading(false);
        return;
      }

      const { error: dbError } = await supabase.from("client_files").insert({
        client_id: clientId,
        doctor_id: targetDoctorId,
        storage_path: fileName,
        comment: fileComment.trim() || null,
      });

      if (dbError) {
        setFileMessage(dbError.message);
        setUploading(false);
        return;
      }

      setSelectedFile(null);
      setFileComment("");
      setFileMessage("Файл загружен");

      await refreshCurrentPageData();
    } catch {
      setFileMessage("Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const handleStartEditFile = (file: ClientFile) => {
    setEditingFileId(file.id);
    setEditingFileComment(file.comment || "");
    setFileMessage(null);
  };

  const handleCancelEditFile = () => {
    setEditingFileId(null);
    setEditingFileComment("");
  };

  const handleSaveFileComment = async (fileId: string) => {
    setSavingFileId(fileId);
    setFileMessage(null);

    const { error } = await supabase
      .from("client_files")
      .update({
        comment: editingFileComment.trim() || null,
      })
      .eq("id", fileId);

    setSavingFileId(null);

    if (error) {
      console.error("FILE UPDATE ERROR:", error);
      setFileMessage(`Ошибка: ${error.message}`);
      return;
    }

    setEditingFileId(null);
    setEditingFileComment("");
    setFileMessage("Комментарий файла сохранён");
    await refreshCurrentPageData();
  };

  const handleDeleteFile = async (file: ClientFile) => {
    const confirmed = window.confirm("Удалить файл?");
    if (!confirmed) return;

    setDeletingFileId(file.id);
    setFileMessage(null);

    try {
      const { error: storageError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([file.storage_path]);

      if (storageError) {
        setFileMessage(`Ошибка удаления файла из storage: ${storageError.message}`);
        setDeletingFileId(null);
        return;
      }

      const { error: dbError } = await supabase
        .from("client_files")
        .delete()
        .eq("id", file.id);

      if (dbError) {
        setFileMessage(`Ошибка удаления записи файла: ${dbError.message}`);
        setDeletingFileId(null);
        return;
      }

      setFileMessage("Файл удалён");
      await refreshCurrentPageData();
    } catch {
      setFileMessage("Ошибка удаления файла");
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleAddDoctorAccess = async () => {
    setAccessMessage(null);

    if (role !== "admin") {
      setAccessMessage("Только admin может управлять доступом");
      return;
    }

    if (!accessDoctorId) {
      setAccessMessage("Выбери доктора");
      return;
    }

    setAccessLoading(true);

    const { error } = await supabase
      .from("client_doctors")
      .insert({
        client_id: clientId,
        doctor_id: accessDoctorId,
      });

    setAccessLoading(false);

    if (error) {
      setAccessMessage(`Ошибка: ${error.message}`);
      return;
    }

    setAccessDoctorId("");
    setAccessMessage("Доступ доктору выдан");
    await refreshCurrentPageData();
  };

  const handleRemoveDoctorAccess = async (targetDoctorId: string) => {
    if (role !== "admin") return;

    const confirmed = window.confirm("Убрать доступ этому доктору?");
    if (!confirmed) return;

    setRemovingDoctorId(targetDoctorId);
    setAccessMessage(null);

    const { error } = await supabase
      .from("client_doctors")
      .delete()
      .eq("client_id", clientId)
      .eq("doctor_id", targetDoctorId);

    setRemovingDoctorId(null);

    if (error) {
      setAccessMessage(`Ошибка: ${error.message}`);
      return;
    }

    setAccessMessage("Доступ убран");
    await refreshCurrentPageData();
  };

  const openFile = async (path: string) => {
    const { data } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(path, 60 * 60);

    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  if (loading) {
    return <main className="p-8">Загрузка...</main>;
  }

  if (!client) {
    return <main className="p-8">Клиент не найден</main>;
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-2">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-neutral-600 hover:text-black w-fit"
          >
            ← Назад
          </button>

          <div className="text-sm text-neutral-600">
            {role === "admin"
              ? `Администратор: ${currentUserName || "—"}`
              : `Доктор: ${currentUserName || "—"}`}
          </div>
        </div>

        {role === "admin" && (
          <div className="mb-6 rounded-2xl border bg-white p-6">
            <h2 className="mb-4 text-xl font-semibold">Доступ докторов к клиенту</h2>

            <div className="mb-4 space-y-3">
              {clientDoctors.length === 0 && (
                <p className="text-neutral-500">Пока нет докторов с доступом</p>
              )}

              {clientDoctors.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between rounded-xl border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {doctorNameMap[link.doctor_id] || "Неизвестный доктор"}
                    </p>
                    {client.doctor_id === link.doctor_id && (
                      <p className="text-sm text-neutral-500">Основной доктор</p>
                    )}
                  </div>

                  <button
                    onClick={() => handleRemoveDoctorAccess(link.doctor_id)}
                    disabled={removingDoctorId === link.doctor_id}
                    className="rounded-xl border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                  >
                    {removingDoctorId === link.doctor_id ? "Удаление..." : "Убрать доступ"}
                  </button>
                </div>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
              <select
                value={accessDoctorId}
                onChange={(e) => setAccessDoctorId(e.target.value)}
                className="rounded-xl border p-3"
              >
                <option value="">Выбери доктора</option>
                {availableDoctorsToAdd.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.display_name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleAddDoctorAccess}
                disabled={accessLoading}
                className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
              >
                {accessLoading ? "Добавление..." : "Добавить доктора"}
              </button>
            </div>

            {accessMessage && <p className="mt-3 text-sm">{accessMessage}</p>}
          </div>
        )}

        <div className="mb-6 rounded-2xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h1 className="text-2xl font-bold">
              {isEditing ? "Редактирование клиента" : client.full_name}
            </h1>

            {!isEditing ? (
              <button
                onClick={() => {
                  fillEditForm(client);
                  setClientMessage(null);
                  setIsEditing(true);
                }}
                className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
              >
                Редактировать
              </button>
            ) : (
              <button
                onClick={() => {
                  fillEditForm(client);
                  setClientMessage(null);
                  setIsEditing(false);
                }}
                className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
              >
                Отмена
              </button>
            )}
          </div>

          {!isEditing ? (
            <>
              <p>Телефон: {client.phone || "—"}</p>
              <p>Дата рождения: {client.birth_date || "—"}</p>
              <p>Статус: {client.status || "—"}</p>
              {role === "admin" && (
                <p>
                  Основной доктор: {doctorNameMap[client.doctor_id] || "—"}
                </p>
              )}

              <div className="mt-4">
                <p className="text-sm text-neutral-500">Заметки</p>
                <p className="whitespace-pre-wrap">{client.notes || "—"}</p>
              </div>
            </>
          ) : (
            <form onSubmit={handleSaveClient} className="grid gap-4">
              <input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                placeholder="Имя клиента"
                className="rounded-xl border p-3"
              />

              <input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="Телефон"
                className="rounded-xl border p-3"
              />

              <input
                type="date"
                value={editBirthDate}
                onChange={(e) => setEditBirthDate(e.target.value)}
                className="rounded-xl border p-3"
              />

              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="rounded-xl border p-3"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="vip">vip</option>
              </select>

              {role === "admin" && (
                <select
                  value={editDoctorId}
                  onChange={(e) => setEditDoctorId(e.target.value)}
                  className="rounded-xl border p-3"
                >
                  <option value="">Выбери основного доктора</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.display_name}
                    </option>
                  ))}
                </select>
              )}

              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={5}
                placeholder="Заметки"
                className="rounded-xl border p-3"
              />

              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={savingClient}
                  className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
                >
                  {savingClient ? "Сохранение..." : "Сохранить"}
                </button>

                {clientMessage && <p>{clientMessage}</p>}
              </div>
            </form>
          )}
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Добавить визит</h2>

          <form onSubmit={handleAddVisit} className="grid gap-4">
            <input
              type="datetime-local"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="rounded-xl border p-3"
            />

            <input
              placeholder="Процедура"
              value={procedure}
              onChange={(e) => setProcedure(e.target.value)}
              className="rounded-xl border p-3"
            />

            <textarea
              placeholder="Заметки по визиту"
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              className="rounded-xl border p-3"
            />

            <button
              type="submit"
              className="rounded-xl bg-black px-5 py-3 text-white"
            >
              Добавить визит
            </button>

            {visitMessage && <p>{visitMessage}</p>}
          </form>
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Загрузить фото / файл</h2>

          <div className="grid gap-4">
            <textarea
              placeholder="Комментарий к файлу"
              value={fileComment}
              onChange={(e) => setFileComment(e.target.value)}
              className="rounded-xl border p-3"
            />

            <input
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setSelectedFile(file);
              }}
              className="rounded-xl border p-3"
            />

            <button
              onClick={handleFileUpload}
              disabled={uploading || !selectedFile}
              className="rounded-xl bg-black px-5 py-3 text-white disabled:opacity-60"
            >
              {uploading ? "Загрузка..." : "Загрузить файл"}
            </button>

            {selectedFile && (
              <p className="text-sm text-neutral-500">
                Выбран файл: {selectedFile.name}
              </p>
            )}

            {fileMessage && <p>{fileMessage}</p>}
          </div>
        </div>

        <div className="mb-6 rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">Файлы клиента</h2>

          {files.length === 0 && (
            <p className="text-neutral-500">Пока нет файлов</p>
          )}

          {files.map((file) => (
            <div key={file.id} className="border-b py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-all">{file.storage_path}</p>

                  <p className="text-sm text-neutral-500">
                    {new Date(file.created_at).toLocaleString()}
                  </p>

                  <p className="text-sm text-neutral-500">
                    Доктор: {doctorNameMap[file.doctor_id] || "—"}
                  </p>

                  {editingFileId === file.id ? (
                    <div className="mt-3 grid gap-3">
                      <textarea
                        value={editingFileComment}
                        onChange={(e) => setEditingFileComment(e.target.value)}
                        rows={3}
                        className="rounded-xl border p-3"
                        placeholder="Комментарий к файлу"
                      />

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleSaveFileComment(file.id)}
                          disabled={savingFileId === file.id}
                          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
                        >
                          {savingFileId === file.id ? "Сохранение..." : "Сохранить"}
                        </button>

                        <button
                          onClick={handleCancelEditFile}
                          className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : (
                    file.comment && (
                      <p className="mt-1 text-sm whitespace-pre-wrap">{file.comment}</p>
                    )
                  )}
                </div>

                {editingFileId !== file.id && (
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => openFile(file.storage_path)}
                      className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-100"
                    >
                      Открыть
                    </button>

                    <button
                      onClick={() => handleStartEditFile(file)}
                      className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-100"
                    >
                      Редактировать
                    </button>

                    <button
                      onClick={() => handleDeleteFile(file)}
                      disabled={deletingFileId === file.id}
                      className="rounded-xl border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {deletingFileId === file.id ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {fileMessage && <p className="mt-4">{fileMessage}</p>}
        </div>

        <div className="rounded-2xl border bg-white p-6">
          <h2 className="mb-4 text-xl font-semibold">История визитов</h2>

          {visits.length === 0 && (
            <p className="text-neutral-500">Пока нет визитов</p>
          )}

          {visits.map((visit) => (
            <div key={visit.id} className="border-b py-3">
              {editingVisitId === visit.id ? (
                <div className="grid gap-3">
                  <input
                    type="datetime-local"
                    value={editVisitDate}
                    onChange={(e) => setEditVisitDate(e.target.value)}
                    className="rounded-xl border p-3"
                  />

                  <input
                    value={editProcedure}
                    onChange={(e) => setEditProcedure(e.target.value)}
                    placeholder="Процедура"
                    className="rounded-xl border p-3"
                  />

                  <textarea
                    value={editVisitNotes}
                    onChange={(e) => setEditVisitNotes(e.target.value)}
                    rows={3}
                    placeholder="Заметки"
                    className="rounded-xl border p-3"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleSaveVisit(visit.id)}
                      disabled={savingVisitId === visit.id}
                      className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
                    >
                      {savingVisitId === visit.id ? "Сохранение..." : "Сохранить"}
                    </button>

                    <button
                      onClick={handleCancelEditVisit}
                      className="rounded-xl border px-4 py-2 hover:bg-neutral-100"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">{visit.procedure_name}</p>

                    <p className="text-sm text-neutral-500">
                      {visit.visit_date ? new Date(visit.visit_date).toLocaleString() : "—"}
                    </p>

                    <p className="text-sm text-neutral-500">
                      Доктор: {doctorNameMap[visit.doctor_id] || "—"}
                    </p>

                    {visit.notes && <p className="mt-2 text-sm">{visit.notes}</p>}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleStartEditVisit(visit)}
                      className="rounded-xl border px-4 py-2 text-sm hover:bg-neutral-100"
                    >
                      Редактировать
                    </button>

                    <button
                      onClick={() => handleDeleteVisit(visit.id)}
                      disabled={deletingVisitId === visit.id}
                      className="rounded-xl border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {deletingVisitId === visit.id ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {visitMessage && <p className="mt-4">{visitMessage}</p>}
        </div>
      </div>
    </main>
  );
}