import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axios from "axios";
import { describe, expect, it, vi } from "vitest";

import { WizardContainer } from "../WizardContainer";
import { OnboardingProvider } from "../onboarding-context";

vi.mock("next/navigation", () => {
  const push = vi.fn();
  return {
    useRouter: () => ({
      push,
      replace: vi.fn(),
      prefetch: vi.fn(),
      refresh: vi.fn(),
    }),
  };
});

vi.mock("axios", () => {
  const post = vi.fn((url: string) => {
    if (typeof url === "string" && url.includes("login-v2")) {
      return Promise.resolve({
        data: [
          {
            code: "LOGIN_SUCCESS",
            result: {
              payload: {
                institution_id: 42,
              },
            },
          },
        ],
      });
    }

    return Promise.resolve({ data: { tenantId: "tenant-123" } });
  });

  const get = vi.fn(() => Promise.resolve({ data: [] }));

  const axiosMock = {
    post,
    get,
    isAxiosError: () => false,
  };

  return {
    default: axiosMock,
  };
});

type AxiosMock = {
  post: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  isAxiosError: (error: unknown) => boolean;
};

const mockedAxios = axios as unknown as AxiosMock;

describe("WizardContainer", () => {
  it("permite concluir o fluxo completo e enviar os dados", async () => {
    render(
      <OnboardingProvider>
        <WizardContainer />
      </OnboardingProvider>,
    );
    const user = userEvent.setup();
    const submitForm = async (element: HTMLElement) => {
      const form = element.closest("form");
      if (!form) {
        throw new Error("Formulário do passo atual não foi encontrado");
      }
      await user.click(
        within(form).getByRole("button", { name: /continuar/i }),
      );
    };

    const emailInput = await screen.findByPlaceholderText(/e-mail/i);
    await user.clear(emailInput);
    await user.type(emailInput, "user@ria.com");
    const passwordInput = await screen.findByPlaceholderText(/senha/i);
    await user.clear(passwordInput);
    await user.type(passwordInput, "senha-segura");
    await user.click(screen.getByRole("button", { name: /entrar/i }));

    const companyNameField = await screen.findByLabelText(/nome do escrit/i);
    await user.clear(companyNameField);
    await user.type(companyNameField, "Acme LTDA");
    const businessHoursField = await screen.findByPlaceholderText(
      /seg a sex/i,
    );
    await user.clear(businessHoursField);
    await user.type(businessHoursField, "8h - 18h");
    await submitForm(companyNameField);

    const streetField = await screen.findByLabelText(/rua/i);
    await user.clear(streetField);
    await user.type(streetField, "Rua Central, 100");
    const cityField = await screen.findByLabelText(/cidade/i);
    await user.clear(cityField);
    await user.type(cityField, "S�o Paulo");
    const stateField = await screen.findByLabelText(/estado/i);
    await user.clear(stateField);
    await user.type(stateField, "SP");
    const zipField = await screen.findByLabelText(/cep/i);
    await user.clear(zipField);
    await user.type(zipField, "01001-000");
    await submitForm(streetField);
    await waitFor(() => {
      expect(screen.queryByLabelText(/rua/i)).toBeNull();
    });

    const agentNameField = await screen.findByLabelText(
      /nome do agente/i,
      {},
      { timeout: 5000 },
    );
    await user.clear(agentNameField);
    await user.type(agentNameField, "Assistente RIA");
    const languageSelect = (await screen.findByLabelText(/idioma principal/i)) as HTMLSelectElement;
    await user.selectOptions(languageSelect, languageSelect.options[1]);
    const personalityField = await screen.findByLabelText(/personalidade/i);
    await user.clear(personalityField);
    await user.type(
      personalityField,
      "Voc� � uma especialista digital que guia o cliente com empatia.",
    );
    const expertiseField = await screen.findByLabelText(/expertise/i);
    await user.clear(expertiseField);
    await user.type(
      expertiseField,
      "Direito previdenci�rio com foco em BPC/LOAS.",
    );
    await submitForm(agentNameField);

    const flowScopeField = await screen.findByLabelText(/escopo do briefing/i);
    await submitForm(flowScopeField);

    const greetingField = await screen.findByLabelText(/sauda/i);
    await user.clear(greetingField);
    await user.type(greetingField, "Oi, sou o agente da Acme!");
    const closingField = await screen.findByLabelText(/despedida/i);
    await user.clear(closingField);
    await user.type(closingField, "Obrigado por falar conosco!");
    const forbiddenField = await screen.findByLabelText(/palavras proibidas/i);
    await user.clear(forbiddenField);
    await user.type(forbiddenField, "cancelamento, atraso");
    await submitForm(greetingField);

    const ragHeading = await screen.findByText(/Arquivos de apoio/i);
    await submitForm(ragHeading);

    const submitButton = await screen.findByRole("button", {
      name: /finalizar cadastro/i,
    });
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    expect(
      screen.getByText(/Tudo certo! Compartilhamos o fluxo configurado/i),
    ).toBeInTheDocument();
  }, 30000);
});
