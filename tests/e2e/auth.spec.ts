import { expect, test } from "@playwright/test";

test("비로그인 사용자는 보호된 업무 화면에서 로그인으로 안내된다", async ({
  page,
}) => {
  await page.goto("/app");

  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("heading", { name: "ERP Fish 로그인" }),
  ).toBeVisible();
  await expect(page.getByText("장부 데이터")).toHaveCount(0);
  await expect(page.getByText("기준정보 데이터")).toHaveCount(0);
});

test("잘못된 로그인은 접근 가능한 한국어 오류를 보여준다", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("hq@example.com");
  await page.getByLabel("비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "로그인" }).click();

  const error = page.locator("#login-error");
  await expect(error).toHaveText("이메일 또는 비밀번호가 올바르지 않습니다.");
  await expect(page.getByLabel("비밀번호")).toHaveAttribute(
    "aria-describedby",
    /login-error/,
  );
  await expect(page.getByLabel("비밀번호")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("본사 계정으로 로그인하면 본사 업무 셸과 사이드바가 보인다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("hq@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("heading", { name: "관제판" })).toBeVisible();

  for (const item of ["홈", "리포트", "기준정보", "설정"]) {
    await expect(page.getByRole("link", { name: item })).toBeVisible();
  }
});

test("지점장 계정으로 로그인하면 자기 지점 오늘 장부 화면으로 이동한다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/store-entry/);
  await expect(page.getByText("오늘 장부", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "강남점" })).toBeVisible();
  const workspaceNav = page.getByLabel("지점장 업무");
  await expect(workspaceNav.getByRole("link", { name: "장부" })).toBeVisible();
  await expect(workspaceNav.getByRole("link", { name: "재고" })).toBeVisible();
  await expect(workspaceNav.getByRole("link", { name: "손실" })).toBeVisible();
  await expect(page.getByRole("link", { name: "기준정보" })).toHaveCount(0);
});

test("이미 로그인한 지점장이 로그인 화면에 접근하면 역할별 목적지로 이동한다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);

  await page.goto("/login");

  await expect(page).toHaveURL(/\/app\/store-entry/);
  await expect(
    page.getByRole("heading", { name: "ERP Fish 로그인" }),
  ).toHaveCount(0);
});

test("활성 배정이 없는 지점장은 본사 문의 안내로 이동한다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("unassigned-manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/store-entry/);
  await expect(
    page.getByText("배정된 활성 지점이 없습니다. 본사에 문의해 주세요."),
  ).toBeVisible();
  await expect(page.getByText("장부 데이터")).toHaveCount(0);
});

test("390px 모바일 지점장 화면은 하단 업무 탭만 터치 가능하게 보여준다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/store-entry/);

  for (const item of ["장부", "재고", "손실"]) {
    const link = page.getByRole("link", { name: item });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  }

  for (const hqOnlyItem of ["기준정보", "리포트", "설정"]) {
    await expect(page.getByRole("link", { name: hqOnlyItem })).toHaveCount(0);
  }
});

test("지점장 업무 진입점은 장부 저장 기능 없이 준비 화면으로 이동한다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/store-entry/);
  await expect(page.getByRole("heading", { name: "강남점" })).toBeVisible();

  const workspaceNav = page.getByLabel("지점장 업무");

  await workspaceNav.getByRole("link", { name: "재고" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry\/inventory/);
  await expect(page.getByRole("heading", { name: "재고 입력" })).toBeVisible();
  await expect(page.getByText(/강남점 · 영업일:/)).toBeVisible();
  await expect(page.getByRole("link", { name: /4단계: 재고/ })).toHaveAttribute(
    "aria-current",
    "step",
  );

  await workspaceNav.getByRole("link", { name: "손실" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry\/losses/);
  await expect(
    page.getByRole("heading", { name: "손실/폐기/떨이 입력" }),
  ).toBeVisible();
  await expect(page.getByText(/강남점 · 영업일:/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /5단계: 손실\/폐기/ }),
  ).toHaveAttribute("aria-current", "step");
});

test("지점장 탭 이동은 선택한 배정 지점을 유지한다", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);

  await page.goto("/app/store-entry?storeId=store-seocho");
  await expect(page.getByRole("heading", { name: "서초점" })).toBeVisible();

  await page
    .getByLabel("지점장 업무")
    .getByRole("link", { name: "재고" })
    .click();

  await expect(page).toHaveURL(
    /\/app\/store-entry\/inventory\?storeId=store-seocho/,
  );
  await expect(page.getByRole("heading", { name: "재고 입력" })).toBeVisible();
  await expect(page.getByText(/서초점 · 영업일:/)).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);

  await page
    .getByLabel("지점장 업무")
    .getByRole("link", { name: "손실" })
    .click();

  await expect(page).toHaveURL(
    /\/app\/store-entry\/losses\?storeId=store-seocho/,
  );
  await expect(
    page.getByRole("heading", { name: "손실\/폐기\/떨이 입력" }),
  ).toBeVisible();
  await expect(page.getByText(/서초점 · 영업일:/)).toBeVisible();
  await expect(page.getByText("강남점")).toHaveCount(0);
});

test("지점장이 다른 지점 URL에 직접 접근하면 권한 없음 화면만 본다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);

  await page.goto("/app/store-entry?storeId=store-hongdae");

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
  await expect(page.getByText("홍대점")).toHaveCount(0);
  await expect(page.getByText("장부 데이터")).toHaveCount(0);
  await expect(page.getByText("기준정보 데이터")).toHaveCount(0);
});

test("잘못된 중복 지점 query는 오류 대신 권한 없음으로 처리한다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);

  await page.goto(
    "/app/store-entry/inventory?storeId=store-gangnam&storeId=store-seocho",
  );

  await expect(page).toHaveURL(/\/app\/unauthorized/);
  await expect(
    page.getByRole("heading", { name: "접근 권한이 없습니다." }),
  ).toBeVisible();
});

test("지점장이 다른 지점 재고와 손실 URL에 직접 접근하면 권한 없음 화면만 본다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/app\/store-entry/);

  for (const path of ["inventory", "losses"]) {
    await page.goto(`/app/store-entry/${path}?storeId=store-hongdae`);

    await expect(page).toHaveURL(/\/app\/unauthorized/);
    await expect(
      page.getByRole("heading", { name: "접근 권한이 없습니다." }),
    ).toBeVisible();
    await expect(page.getByText("홍대점")).toHaveCount(0);
    await expect(page.getByText("장부 데이터")).toHaveCount(0);
    await page.goto("/app/store-entry");
  }
});

test("비활성 지점만 배정된 지점장은 본사 문의 안내만 본다", async ({
  page,
}) => {
  await page.goto("/login");

  await page.getByLabel("이메일").fill("inactive-manager@example.com");
  await page.getByLabel("비밀번호").fill("correct-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/app\/store-entry/);
  await expect(
    page.getByText("배정된 활성 지점이 없습니다. 본사에 문의해 주세요."),
  ).toBeVisible();
  await expect(page.getByText("폐점")).toHaveCount(0);
  await expect(page.getByText("장부 데이터")).toHaveCount(0);
});
