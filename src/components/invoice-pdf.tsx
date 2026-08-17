import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const STATUS_LABEL: Record<string, string> = {
  sent: "Menunggu Pembayaran",
  paid: "Lunas",
};

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    color: "#17263D",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    borderBottom: "2 solid #17263D",
    paddingBottom: 16,
  },
  brand: { fontSize: 20, fontWeight: 700, color: "#17263D" },
  brandSub: { fontSize: 10, color: "#64748b", marginTop: 2 },
  invoiceTitle: { fontSize: 16, fontWeight: 700, textAlign: "right" },
  invoiceNumber: { fontSize: 10, color: "#64748b", textAlign: "right", marginTop: 2 },
  status: { fontSize: 10, textAlign: "right", marginTop: 6, fontWeight: 700 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  label: { color: "#64748b" },
  value: { fontWeight: 700 },
  table: { marginTop: 8, borderTop: "1 solid #e2e8f0" },
  tableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottom: "1 solid #e2e8f0",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 16,
  },
  totalLabel: { fontSize: 12, fontWeight: 700 },
  totalValue: { fontSize: 16, fontWeight: 700, color: "#1a8f6f" },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    fontSize: 9,
    color: "#94a3b8",
    textAlign: "center",
  },
});

function formatRupiah(amount: number) {
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export function InvoicePdf({
  invoiceNumber,
  status,
  sentAt,
  studentName,
  parentName,
  packageName,
  sessionsCount,
  amount,
}: {
  invoiceNumber: string;
  status: string;
  sentAt: string | null;
  studentName: string;
  parentName: string;
  packageName: string;
  sessionsCount: number;
  amount: number;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Sari Les Renang</Text>
            <Text style={styles.brandSub}>Invoice Tagihan Les Renang</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
            <Text style={styles.status}>
              {STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ditagihkan Kepada</Text>
          <Text style={styles.value}>{parentName}</Text>
          <Text>Siswa: {studentName}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Tanggal Terbit</Text>
            <Text>{sentAt ?? "-"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <View>
              <Text style={{ fontWeight: 700 }}>{packageName}</Text>
              <Text style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                {sessionsCount} sesi
              </Text>
            </View>
            <Text style={{ fontWeight: 700 }}>{formatRupiah(amount)}</Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatRupiah(amount)}</Text>
        </View>

        <Text style={styles.footer}>
          Invoice ini dibuat otomatis oleh sistem Sari Les Renang. Untuk
          informasi metode pembayaran, hubungi admin.
        </Text>
      </Page>
    </Document>
  );
}
