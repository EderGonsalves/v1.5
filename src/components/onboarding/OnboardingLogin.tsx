"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  loginSchema,
  type LoginCredentials,
  type AuthInfo,
} from "@/lib/validations";
import { getBaserowConfigs, syncUserAccount } from "@/services/api";
import { cn } from "@/lib/utils";
import { extractDisplayName } from "@/lib/auth/user";

import { useOnboarding } from "./onboarding-context";

export const OnboardingLogin = () => {
  const { updateSection } = useOnboarding();
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- habilita renderização somente após o cliente montar
    setIsClient(true);
  }, []);

  const form = useForm<LoginCredentials>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: LoginCredentials) => {
    setErrorMessage("");

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(
          errData?.error ?? "Não foi possível validar seu acesso",
        );
      }

      const data = await response.json();
      const authInfo: AuthInfo = {
        institutionId: data.institutionId,
        token: data.token,
        expiresAt: data.expiresAt,
        payload: data.payload,
        legacyUserId: data.legacyUserId ?? values.email,
      };

      updateSection({ auth: authInfo });

      try {
        const displayName =
          extractDisplayName(authInfo.payload, values.email.split("@")[0]) ??
          values.email.split("@")[0];

        await syncUserAccount({
          institutionId: authInfo.institutionId,
          legacyUserId: authInfo.legacyUserId ?? values.email,
          email: values.email.toLowerCase(),
          name: displayName,
          password: values.password,
          isActive: true,
        });
      } catch (syncError) {
        console.error("Falha ao sincronizar usuário com o Baserow", syncError);
      }
      // Verificar se já existe configuração no Baserow
      try {
        const baserowConfigs = await getBaserowConfigs(
          authInfo.institutionId,
        );
        if (baserowConfigs && baserowConfigs.length > 0) {
          console.log("Configuração encontrada no Baserow, redirecionando para página de configurações");
          router.push("/configuracoes");
          return;
        }
      } catch (configError) {
        console.log("Nenhuma configuração encontrada no Baserow, continuando com onboarding");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível validar seu acesso",
      );
    }
  };

  if (!isClient) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundColor: "#0d4c6c" }}>
      {/* Padrões circulares de fundo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full opacity-20" style={{ backgroundColor: "#5eead4", transform: "translate(-30%, -30%)" }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-20" style={{ backgroundColor: "#5eead4", transform: "translate(30%, 30%)" }} />
      </div>

      {/* Card branco centralizado */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        {/* Logo e Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="mb-4 flex justify-center">
            <div className="w-16 h-16 flex items-center justify-center">
              <Image
                src="https://app.riasistemas.com.br/_nuxt/img/icon.fd8c0a5.png"
                alt="Briefing Jurídico"
                width={64}
                height={64}
                className="object-contain"
                unoptimized
              />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "#1e40af" }}>
            BRIEFING JURÍDICO
          </h1>
          <p className="text-sm font-medium" style={{ color: "#3b82f6" }}>
            RIA SISTEMAS
          </p>
        </div>

        {/* Título de boas-vindas */}
        <div className="mb-6 text-center">
          <h2 className="text-3xl font-bold mb-2" style={{ color: "#1e40af" }}>
            Bem-vindo
          </h2>
          <p className="text-sm text-gray-500">
            Acesse sua conta para continuar
          </p>
        </div>

        {/* Formulário */}
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            {/* Campo E-mail */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        {...field}
                        type="email"
                        autoComplete="email"
                        placeholder="E-mail"
                        className={cn(
                          "pl-10 pr-4 h-12 border-gray-300 rounded-lg",
                          "focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        )}
                      />
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-500 text-xs mt-1" />
                </FormItem>
              )}
            />

            {/* Campo Senha */}
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        {...field}
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="Senha"
                        className={cn(
                          "pl-10 pr-12 h-12 border-gray-300 rounded-lg",
                          "focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-500 text-xs mt-1" />
                </FormItem>
              )}
            />

            {/* Checkbox Mantenha-me conectado */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={setRememberMe}
                className="h-4 w-4 border-gray-300"
              />
              <label
                htmlFor="remember"
                className="text-sm text-gray-700 cursor-pointer"
              >
                Mantenha-me conectado
              </label>
            </div>

            {/* Mensagem de erro */}
            {errorMessage ? (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-600">
                {errorMessage}
              </div>
            ) : null}

            {/* Botão Entrar */}
            <Button
              type="submit"
              className="w-full h-12 rounded-lg font-bold text-base hover:opacity-90 transition-opacity"
              style={{ backgroundColor: "#0d4c6c", color: "#ffffff" }}
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </Form>

        {/* Links */}
        <div className="mt-6 space-y-3 text-center">
          <a
            href="#"
            className="block text-sm hover:underline"
            style={{ color: "#3b82f6" }}
            onClick={(e) => {
              e.preventDefault();
              console.log("Esqueceu senha clicado");
            }}
          >
            Esqueceu sua senha?
          </a>
          <p className="text-sm text-gray-600">
            Não tem uma conta?{" "}
            <a
              href="#"
              className="font-semibold hover:underline"
              style={{ color: "#1e40af" }}
              onClick={(e) => {
                e.preventDefault();
                console.log("Cadastre-se clicado");
              }}
            >
              Cadastre-se
            </a>
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-500">
            Briefing Juridico • RIA Sistemas
          </p>
        </div>
      </div>
    </div>
  );
};
