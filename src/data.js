export const data = {
  name: "NSAT",
  children: [
    {
      name: "SZ-Internet",
      children: [
        {
          name: "Prod",
          children: [
            {
              name: "Tier-Web",
              children: [
                {
                  name: "App-Portal",
                  children: [
                    { name: "host-portal-01" },
                    { name: "host-portal-02" },
                    { name: "host-portal-03" },
                    { name: "host-portal-04" },
                    { name: "host-portal-05" },
                  ],
                },
                {
                  name: "App-Auth",
                  children: [
                    { name: "host-auth-01" },
                    { name: "host-auth-02" },
                    { name: "host-auth-03" },
                  ],
                },
                {
                  name: "App-Static",
                  children: [{ name: "host-cdn-01" }, { name: "host-cdn-02" }],
                },
              ],
            },
            {
              name: "Tier-API",
              children: [
                {
                  name: "App-Gateway",
                  children: [
                    { name: "host-gw-01" },
                    { name: "host-gw-02" },
                    { name: "host-gw-03" },
                  ],
                },
                {
                  name: "App-Profile",
                  children: [
                    { name: "host-profile-01" },
                    { name: "host-profile-02" },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: "UAT",
          children: [
            {
              name: "Tier-Web",
              children: [
                {
                  name: "App-Portal",
                  children: [
                    { name: "host-uat-portal-01" },
                    { name: "host-uat-portal-02" },
                    { name: "host-uat-portal-03" },
                  ],
                },
              ],
            },
            {
              name: "Tier-API",
              children: [
                {
                  name: "App-Gateway",
                  children: [
                    { name: "host-uat-gw-01" },
                    { name: "host-uat-gw-02" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },

    {
      name: "SZ-Core",
      children: [
        {
          name: "Prod",
          children: [
            {
              name: "Tier-App",
              children: [
                {
                  name: "App-Payments",
                  children: [
                    { name: "host-pay-01" },
                    { name: "host-pay-02" },
                    { name: "host-pay-03" },
                    { name: "host-pay-04" },
                  ],
                },
                {
                  name: "App-Ledger",
                  children: [
                    { name: "host-ledger-01" },
                    { name: "host-ledger-02" },
                    { name: "host-ledger-03" },
                  ],
                },
                {
                  name: "App-Risk",
                  children: [
                    { name: "host-risk-01" },
                    { name: "host-risk-02" },
                  ],
                },
              ],
            },
            {
              name: "Tier-DB",
              children: [
                {
                  name: "App-DBCluster",
                  children: [
                    { name: "host-db-01" },
                    { name: "host-db-02" },
                    { name: "host-db-03" },
                  ],
                },
                {
                  name: "App-Cache",
                  children: [
                    { name: "host-redis-01" },
                    { name: "host-redis-02" },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: "DR",
          children: [
            {
              name: "Tier-App",
              children: [
                {
                  name: "App-Payments",
                  children: [
                    { name: "host-dr-pay-01" },
                    { name: "host-dr-pay-02" },
                  ],
                },
              ],
            },
            {
              name: "Tier-DB",
              children: [
                {
                  name: "App-DBCluster",
                  children: [
                    { name: "host-dr-db-01" },
                    { name: "host-dr-db-02" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const leafConnections = [
  { source: "host-portal-01", target: "host-auth-02" },
  { source: "host-portal-01", target: "host-gw-03" },
  { source: "host-portal-03", target: "host-gw-02" },
  { source: "host-cdn-01", target: "host-profile-02" },
  { source: "host-uat-gw-01", target: "host-uat-portal-02" },
  { source: "host-pay-02", target: "host-ledger-03" },
  { source: "host-risk-01", target: "host-db-02" },
  { source: "host-redis-02", target: "host-dr-db-01" },
  // --- New Connections ---
  { source: "host-portal-05", target: "host-gw-01" },
  { source: "host-auth-03", target: "host-profile-01" },
  { source: "host-gw-02", target: "host-pay-01" },
  { source: "host-pay-04", target: "host-db-03" },
  { source: "host-ledger-02", target: "host-db-01" },
  { source: "host-profile-02", target: "host-redis-01" },
  { source: "host-uat-portal-01", target: "host-uat-gw-02" },
  { source: "host-dr-pay-01", target: "host-dr-db-02" },
  { source: "host-portal-02", target: "host-auth-01" },
  { source: "host-pay-03", target: "host-risk-02" },
  // --- SZ bulge connection tests ---
  { source: "host-dr-db-02", target: "host-portal-01" },
];
