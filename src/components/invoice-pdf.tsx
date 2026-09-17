import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const STATUS_LABEL: Record<string, string> = {
  sent: "Menunggu Pembayaran",
  paid: "Lunas",
};

const STATUS_COLOR: Record<string, string> = {
  sent: "#b45309",
  paid: "#1a8f6f",
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
    marginBottom: 20,
  },
  logo: { width: 90, height: 90 },
  contact: { fontSize: 9, color: "#64748b", textAlign: "right" },
  contactLine: { marginBottom: 2 },
  divider: { borderBottom: "2 solid #17263D", marginBottom: 20 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 2 },
  subtitle: { fontSize: 11, color: "#64748b", marginBottom: 20 },
  infoRow: { flexDirection: "row", marginBottom: 24 },
  infoCol: { flex: 1 },
  infoLabel: {
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  infoValue: { fontWeight: 700, marginBottom: 2 },
  table: { marginTop: 4 },
  tableHead: {
    flexDirection: "row",
    borderBottom: "1 solid #17263D",
    paddingBottom: 6,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottom: "1 solid #e2e8f0",
  },
  colProgram: { flex: 3 },
  colSesi: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  tableHeadText: {
    fontSize: 9,
    color: "#64748b",
    textTransform: "uppercase",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    paddingTop: 16,
    gap: 12,
  },
  totalLabel: { fontSize: 12, fontWeight: 700 },
  totalValue: { fontSize: 18, fontWeight: 700, color: "#1a8f6f" },
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
  logoUrl,
  address,
  phone,
  email,
  invoiceNumber,
  status,
  sentAt,
  studentName,
  parentName,
  packageName,
  packageNumber,
  sessionsCount,
  amount,
}: {
  logoUrl: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoiceNumber: string;
  status: string;
  sentAt: string | null;
  studentName: string;
  parentName: string;
  packageName: string;
  packageNumber: number;
  sessionsCount: number;
  amount: number;
}) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer's Image, not an HTML img */}
          <Image src={logoUrl} style={styles.logo} />
          <View style={styles.contact}>
            {address && <Text style={styles.contactLine}>{address}</Text>}
            {phone && <Text style={styles.contactLine}>{phone}</Text>}
            {email && <Text style={styles.contactLine}>{email}</Text>}
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={styles.title}>INVOICE</Text>
        <Text style={styles.subtitle}>Tagihan Program Sari Les Renang</Text>

        <View style={styles.infoRow}>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Ditagihkan Kepada</Text>
            <Text style={styles.infoValue}>{parentName}</Text>
            <Text>Siswa: {studentName}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Nomor Invoice</Text>
            <Text style={styles.infoValue}>{invoiceNumber}</Text>
            <Text>Terbit: {sentAt ?? "-"}</Text>
          </View>
          <View style={styles.infoCol}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text
              style={{
                ...styles.infoValue,
                color: STATUS_COLOR[status] ?? "#17263D",
              }}
            >
              {STATUS_LABEL[status] ?? status}
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.tableHeadText, styles.colProgram]}>
              Program / Paket
            </Text>
            <Text style={[styles.tableHeadText, styles.colSesi]}>
              Jumlah Sesi
            </Text>
            <Text style={[styles.tableHeadText, styles.colTotal]}>
              Total Tagihan
            </Text>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.colProgram}>
              <Text style={{ fontWeight: 700 }}>{packageName}</Text>
              <Text style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>
                Paket ke-{packageNumber}
              </Text>
            </View>
            <Text style={styles.colSesi}>{sessionsCount} sesi</Text>
            <Text style={[styles.colTotal, { fontWeight: 700 }]}>
              {formatRupiah(amount)}
            </Text>
          </View>
        </View>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>TOTAL TAGIHAN</Text>
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
